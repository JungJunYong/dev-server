import chalk from 'chalk';
import dotenv from 'dotenv';
import Koa from 'koa';
import figlet from 'figlet';
import session from 'koa-session';
import path from 'path';
import { URL } from 'url';
import cors from './cors';
import interceptor from './interceptor';
import ConsoleLogger, { RequestTrackerInterface } from './logger';
import proxy from './proxy';
import { KoaContextForProxy } from './proxy/ProxyServer';
import serve from './static';
import * as fs from 'fs';


async function configure(): Promise<Koa> {
    const app = new Koa();
    // 환경 구성
    await configureEnvironments();

    app.use(session({key: 'SESS_ID', signed: false}, app));

    const logger = new ConsoleLogger({});
    app.use(logger.middleware);
    app.use(cors());

    // 인터셉터 미들웨어가 실행하기 전에 사용자가 등록한 미들웨어 실행
    if (fs.existsSync(path.resolve(process.env.STATIC_BEFORE_INJECTION))) {
        const beforeInterceptor = await import(path.resolve(process.env.STATIC_BEFORE_INJECTION));
        app.use(beforeInterceptor.default);
    }

    app.use(
        interceptor({
            root: process.env.MOCK_DIR,
            logs: (ctx, target, callFunc) => {
                ctx.tracker.target = 'local';
                ctx.tracker.log = `${ctx.originalUrl} -> ${target}${callFunc ? `[${chalk.yellow(callFunc)}]` : ''}`;
            },
            ignores: [process.env.IGNORES],
            extensions: process.env.INTERCEPTOR_EXTENSIONS
        })
    );

    app.use(
        serve({
            root: process.env.MOCK_DIR,
            logs: (ctx, target) => {
                ctx.tracker.target = 's_res';
                ctx.tracker.log = `${ctx.originalUrl} -> ${target}`;
            }
        })
    );


    app.use(
        proxy({
            target: process.env.PROXY,
            changeOrigin: true,
            ws: true,
            logs: (ctx: KoaContextForProxy & RequestTrackerInterface, target) => {
                ctx.tracker.target = 'proxy';
                ctx.tracker.log = `${ctx.req.url} -> ${new URL(ctx.req.url, target)}`;
            },
            logsWs: /* istanbul ignore next */ (ctx: KoaContextForProxy & RequestTrackerInterface, type, target) => {
                ctx.tracker = {};
                ctx.tracker.start = new Date();
                ctx.tracker.target = 'proxy';
                ctx.tracker.type = 'WS';
                ctx.tracker.status = type;
                switch (type) {
                    case 'open':
                        ctx.tracker.status = 'opn';
                        ctx.tracker.log = chalk.bold.greenBright('🔗') + ' ' + target;
                        break;
                    case 'send':
                        ctx.tracker.status = 'snd';
                        ctx.tracker.log = chalk.bold.green('->') + ' ' + target;
                        break;
                    case 'receive':
                        ctx.tracker.status = 'rec';
                        ctx.tracker.log = chalk.bold.yellow('<-') + ' ' + target;
                        break;
                    case 'close':
                        ctx.tracker.status = 'cls';
                        ctx.tracker.log = chalk.bold.red('🚪') + ' ' + target;
                        break;
                }
                logger.log(ctx);
            }
        })
    );

    return app;
}



export { configure };

if (require.main === module) {
    /* istanbul ignore next */
    configure().then((app) => {
        // banner 출력
        console.log(
            chalk.blueBright(
                figlet.textSync(process.env.NAME?.toUpperCase(), {
                    font: 'Small Slant',
                    horizontalLayout: 'default',
                    verticalLayout: 'default'
                })
            )
        );

        app.on('error', (e, ctx) => {
            console.log(e);
            ctx.body = { state: 'error', message: e.message, stack: e.stack };
        });

        // 서버 시작
        app.listen(parseInt(process.env.PORT, 10), '0.0.0.0', 511, () => {
            console.log(
                `🚀 ${chalk.greenBright(`${process.env.NAME} started`)} at ${chalk.blueBright(
                    `http://localhost:${process.env.PORT}`
                )}`
            );
        });
    });
}



/**
 * .env 파일을 읽어 실행 환경을 구성합니다.
 */
async function configureEnvironments(): Promise<void> {
    // process.cwd() 경로에 존재하는 우선 순위가 높은 .env 파일로 환경을 구성합니다.
    dotenv.config();


    // 다른 프로젝트에서 사용될 경우 현재 패키지의 .env 파일로 설정되지 않은 환경을 추가로 구성합니다.
    dotenv.config({path: path.resolve(__dirname, '../.env')});
}

