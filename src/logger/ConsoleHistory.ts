import chalk from 'chalk';
import Koa, { DefaultState } from 'koa';

export interface ConsoleHistoryMiddlewareOptions {
    template?: (ctx: Koa.ParameterizedContext<DefaultState, RequestTrackerInterface>) => string;
}

export interface RequestTrackerInterface {
    tracker: {
        target?: string;
        type?: string;
        status?: string;
        start?: Date;
        end?: Date;
        span?: number;
        log?: string;
    };
}

type ConsoleHistoryContext = Koa.ParameterizedContext<DefaultState, RequestTrackerInterface>;

/**
 * 콘솔 화면에 요청 히스토리를 작성하기 위한 클래스입니다.
 */
export class ConsoleHistory {
    constructor(private options: ConsoleHistoryMiddlewareOptions) {}

    public get middleware(): Koa.Middleware {
        return async (ctx: ConsoleHistoryContext, next: Koa.Next) => {
            // 기본 값 설정
            ctx.tracker = {
                target: 'local',
                type: ctx.req.method,
                log: '',
                start: new Date() // 처리 시작 시각 설정
            };

            await next();
            // 처리 완료 시각 설정
            ctx.tracker.end = new Date();
            ctx.tracker.span = ctx.tracker.end.valueOf() - ctx.tracker.start.valueOf();

            // 로그 작성
            this.log(ctx);
        };
    }

    log(ctx: ConsoleHistoryContext): void {
        if (!ctx.tracker.status) {
            ctx.tracker.status = ctx.status.toString();
        }
        /* istanbul ignore if */
        if (!ctx.tracker.log) {
            ctx.tracker.log = ctx.request.originalUrl;
        }
        /* istanbul ignore next */
        ctx.tracker.log =
            typeof this.options?.template === 'function' ? this.options?.template(ctx) : ConsoleHistory.logger(ctx);
        console.log(ctx.tracker.log);
    }

    private static logger(ctx: ConsoleHistoryContext): string {
        let target: string;
        if (ctx.tracker.type) {
            let targetDeco: chalk.Chalk;
            switch (ctx.tracker.target.toLowerCase()) {
                case 'proxy':
                    targetDeco = chalk.bold.whiteBright.bgGreen;
                    break;
                case 's_res':
                    targetDeco = chalk.bold.whiteBright.bgBlue;
                    break;
                default:
                    targetDeco = chalk.bold.whiteBright.bgRed;
                    break;
            }
            target = targetDeco(` ${ctx.tracker.target.toUpperCase()} `);
        }

        let type: string;
        if (ctx.tracker.type) {
            let typeDeco: chalk.Chalk;
            switch (ctx.tracker.type.toLowerCase()) {
                case 'get':
                    typeDeco = chalk.green;
                    break;
                case 'post':
                    typeDeco = chalk.blue;
                    break;
                default:
                    typeDeco = chalk.cyan;
                    break;
            }
            type = typeDeco(ctx.tracker.type.toUpperCase().padStart(4));
        }

        let status: string;

        if (ctx.tracker.status) {
            let statusDeco: chalk.Chalk;
            if (/^\d+$/.test(ctx.tracker.status)) {
                const statusCode = parseInt(ctx.tracker.status, 10);
                if (statusCode && statusCode < 300) {
                    statusDeco = chalk.greenBright;
                } else if (statusCode < 400) {
                    statusDeco = chalk.yellowBright;
                } else if (statusCode < 500) {
                    statusDeco = chalk.redBright;
                } else {
                    statusDeco = chalk.red;
                }
                status = statusDeco(statusCode.toString().padStart(3));
            } else {
                switch (ctx.tracker.status.toLowerCase()) {
                    case 'opn':
                        statusDeco = chalk.cyan;
                        break;
                    case 'snd':
                        statusDeco = chalk.green;
                        break;
                    case 'rec':
                        statusDeco = chalk.yellow;
                        break;
                    case 'cls':
                    default:
                        statusDeco = chalk.red;
                        break;
                }
                status = statusDeco(ctx.tracker.status.substring(0, 3).toUpperCase().padStart(3));
            }
        }

        let span: string;
        if (ctx.tracker.span) {
            let spanDeco: chalk.Chalk;
            if (ctx.tracker.span >= 2000) {
                spanDeco = chalk.red;
            } else if (ctx.tracker.span >= 1000) {
                spanDeco = chalk.yellow;
            } else {
                spanDeco = chalk.green;
            }
            span = spanDeco(ctx.tracker.span?.toString() + 'ms');
        }

        return `${ctx.tracker.start.toLocaleTimeString()} ${target ? target + ' ' : ''}${type ? type + ' ' : ''}${
            status ? status + ' ' : ''
        }${ctx.tracker.log}${span ? ' (' + span + ') ' : ''}`;
    }
}
