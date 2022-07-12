import { EventEmitter } from 'events';
import fs from 'fs';
import { Context, Middleware, Next } from 'koa';
import path from 'path';

/**
 * 인터셉터 미들웨어의 설정 옵션입니다.
 */
export interface InterceptorMiddlewareOptions {
    /**
     * 파일을 찾을 루트 경로를 설정합니다.
     */
    root: string;
    /**
     * 요청을 인터셉트하여 처리할 수 있는 파일의 확장자를 지정합니다.
     * 앞에 있을수록 처리 우선 순위가 높습니다.
     */
    extensions?: string[] | string;

    /**
     * 파일을 찾지 않는 경로를 루트로 부터 상대 경로로 정합니다.
     */
    ignores?: string[];

    logs?: (ctx: Context, target: string, callFunc?: string) => void;
}

const defaultOptions: InterceptorMiddlewareOptions = {
    root: process.cwd(),
    extensions: ['js', 'json', 'html'],
    ignores: []
};

/**
 * 요청 URL 을 이용하여 로컬에 실행할 수 있는 소스가 존재하는지 확인하고 전달합니다.
 */
export class Interceptor extends EventEmitter {
    constructor(private readonly options: InterceptorMiddlewareOptions) {
        super();

        this.options = {
            ...defaultOptions,
            ...options
        };

        /* istanbul ignore else */
        if (typeof this.options.extensions === 'string') {
            this.options.extensions = this.options.extensions
                .split(/,\s*/)
                .map((item) => item.replace(/^./, ''))
                .filter((item) => !!item);
        }

        this.options.root = path.resolve(this.options.root);

        this.options.ignores = this.options.ignores.map((item) => path.resolve(this.options.root, item));

        /* istanbul ignore else */
        if (typeof this.options.logs === 'function') {
            this.on('log', this.options.logs);
        }
    }

    get middleware(): Middleware {
        return async (ctx: Context, next: Next) => {
            // 요청 주소에 확장자가 지정되지 않은 경우만 처리합니다.
            // 확장자 있는 경우 koa-static 미들웨어로 위임
            if (path.extname(ctx.path)) return await next();

            // 인터셉트 하지 않도록 ignores 에 등록된 경로의 요청일 경우 처리하지 않습니다.
            if (this.IsInsideIgnored(ctx.path)) return await next();

            const targetPath = ctx.path.replace(/\/$/, '');
            // 파일이 존재하는 확장자를 우선 순위가 높은 순으로 찾아 가져옵니다.
            const ext = this.findExtension(targetPath);

            if (!ext) {
                return await next();
            }
            switch (ext) {
                case 'js':
                    try {
                        const module = await import(path.resolve(this.options.root, `.${targetPath}`));

                        if (typeof module[ctx.method.toLowerCase()] === 'function') {
                            module[ctx.method.toLowerCase()](ctx, next);
                            this.emit(
                                'log',
                                ctx,
                                `/${path.relative(process.cwd(), path.join(this.options.root, targetPath))}.${ext}`,
                                ctx.method.toLowerCase()
                            );
                        } else {
                            if (typeof module['all'] === 'function') {
                                module['all'](ctx, next);
                                this.emit(
                                    'log',
                                    ctx,
                                    `/${path.relative(process.cwd(), path.join(this.options.root, targetPath))}.${ext}`,
                                    'all'
                                );
                            } else {
                                return await next();
                            }
                        }
                    } catch (e) {
                        /* istanbul ignore next */
                        ctx.body = {state: 'error', message: e.message, error: e.stack};
                        /* istanbul ignore next */
                        ctx.app.emit('error', e, ctx);
                    }
                    break;
                case 'json':
                    try {
                        const json = await import(path.resolve(this.options.root, `.${targetPath}`));

                        if (json.default) {
                            if (!json.default.state) {
                                ctx.body = {state: 'success', data: json.default};
                            } else {
                                ctx.body = json.default;
                            }
                        } else {
                            ctx.body = {state: 'success', data: json};
                        }

                        this.emit('log', ctx, `/${path.relative(process.cwd(), path.join(this.options.root, targetPath))}.${ext}`);
                    } catch (e) {
                        /* istanbul ignore next */
                        ctx.body = {state: 'error', message: e.message, error: e.stack};
                        /* istanbul ignore next */
                        ctx.app.emit('error', e, ctx);
                    }
                    break;
                default:
                    // js, json 파일이 아니면 요청의 path 를 수정해서 koa-static 으로 처리를 위임합니다.
                    ctx.path = `${targetPath}.${ext}`;
                    return await next();
            }
        };
    }

    private findExtension(reqPath: string): string {
        return (this.options.extensions as string[]).find((ext) => {
            const file = path.resolve(this.options.root, `.${reqPath}.${ext}`);
            return fs.existsSync(file);
        });
    }

    private IsInsideIgnored(reqPath: string): boolean {
        return this.options.ignores.findIndex((dir) => reqPath.startsWith(dir)) >= 0;
    }
}