import { Context, Middleware } from 'koa';
import send from 'koa-send';
import path from 'path';
import events from 'events';

export interface StaticResourcesMiddlewareOptions extends send.SendOptions {
    defer?: boolean;
    logs?: (ctx: Context, target: string, options?: StaticResourcesMiddlewareOptions) => void;
}

const defaultOptions = {
    path: './'
};

const serve = (options: StaticResourcesMiddlewareOptions): Middleware => {
    const eventEmitter = new events.EventEmitter();

    options = {
        ...defaultOptions,
        ...options
    };

    /* istanbul ignore else */
    if (options.index !== false) options.index = options.index || 'index.html';

    /* istanbul ignore else */
    if (typeof options.logs === 'function') {
        eventEmitter.on('log', options.logs);
    }

    /* istanbul ignore else */
    if (!options.defer) {
        return async (ctx, next) => {
            let done: string | false = false;
            /* istanbul ignore else */
            if (ctx.method === 'HEAD' || ctx.method === 'GET') {
                try {
                    done = await send(ctx, ctx.path, options);
                    eventEmitter.emit('log', ctx, '/' + path.relative(process.cwd(), path.join(options.root, ctx.path)), options);
                } catch (err) {
                    if (err.status !== 404) {
                        /* istanbul ignore next */
                        throw err;
                    }
                }
            }

            if (!done) {
                await next();
            }
        };
    }

    return async (ctx, next) => {
        await next();

        if (ctx.method !== 'HEAD' && ctx.method !== 'GET') return;

        if (ctx.body != null || ctx.status !== 404) return;

        try {
            await send(ctx, ctx.path, options);
            eventEmitter.emit('log', ctx, '/' + path.relative(process.cwd(), path.join(options.root, ctx.path)), options);
        } catch (err) {
            /* istanbul ignore next */
            if (err.status !== 404) {
                throw err;
            }
        }
    };
};

export default serve;
