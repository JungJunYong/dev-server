import { Context, Next } from 'koa';

const enum HeaderNames {
    Origin = 'Access-Control-Allow-Origin',
    Credentials = 'Access-Control-Allow-Credentials',
    Methods = 'Access-Control-Allow-Methods',
    Headers = 'Access-Control-Allow-Headers',
    MaxAge = 'Access-Control-Max-Age',
    ExposeHeaders = 'Access-Control-Expose-Headers'
}

export interface CorsMiddlewareOptions {
    origin?: ((ctx?: Context) => string | Promise<string>) | string;
    credential?: boolean | ((ctx?: Context) => boolean | Promise<boolean>);
    exposeHeaders?: string | string[];
    allowMethods?: string | string[];
    allowHeaders?: string | string[];
    maxAge?: string;
    keepHeadersOnError?: boolean;
}

const corsMiddleware = (options?: CorsMiddlewareOptions) => {
    const defaults = {
        allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH'
    };

    options = {
        ...defaults,
        ...options
    };

    if (Array.isArray(options.exposeHeaders)) {
        options.exposeHeaders = options.exposeHeaders.join(',');
    }
    if (Array.isArray(options.allowMethods)) {
        options.allowMethods = options.allowMethods.join(',');
    }
    if (Array.isArray(options.allowHeaders)) {
        options.allowHeaders = options.allowHeaders.join(',');
    }

    options.keepHeadersOnError = options.keepHeadersOnError === undefined || !!options.keepHeadersOnError;

    return async function cors(ctx: Context, next: Next) {
        const requestOrigin = ctx.get('Origin');

        ctx.vary('Origin');

        if (!requestOrigin) return await next();

        let origin: string | Promise<string>;
        if (typeof options.origin === 'function') {
            origin = options.origin(ctx);
            if (origin instanceof Promise) origin = await origin;
            if (origin) return await next();
        } else {
            origin = options.origin || requestOrigin;
        }

        let credentials;
        if (typeof options.credential === 'function') {
            credentials = options.credential(ctx);
            if (credentials instanceof Promise) credentials = await credentials;
        } else {
            credentials = !!options.credential;
        }

        const headersSet = {};

        function set(key: string, value: string): void {
            ctx.set(key, value);
            headersSet[key] = value;
        }

        if (ctx.method !== 'OPTIONS') {
            // 일반적인 Cross-Origin 요청이거나 실제 요청 또는 리다이렉션
            set(HeaderNames.Origin, origin);

            if (credentials === true) {
                set(HeaderNames.Credentials, 'true');
            }

            if (options.exposeHeaders) {
                set(HeaderNames.ExposeHeaders, options.exposeHeaders as string);
            }

            if (!options.keepHeadersOnError) {
                return await next();
            }
            /* istanbul ignore next */
            try {
                return await next();
            } catch (err) {
                const errHeadersSet = err.headers || {};
                const originVary = errHeadersSet.vary || errHeadersSet.Vary || '';
                let varyWithOrigin = '';
                if (originVary === '*') {
                    varyWithOrigin = '*';
                } else {
                    // vary 패키지를 사용하지 않기 위해 직접 구현 (문제시 vary 패키지 이용)
                    const varyArray = originVary.split(/,\s/);
                    varyArray.filter((item) => !/Origin/i.test(item)).push('Origin');
                    varyWithOrigin = varyArray.join(', ');
                }
                delete errHeadersSet.Vary;

                err.headers = {
                    ...errHeadersSet,
                    ...headersSet,
                    ...{ vary: varyWithOrigin }
                };
                throw err;
            }
        } else {
            // Preflight Request

            // Access-Control-Request-Method 헤더가 없거나 구문 분석이 실패한 경우
            // 추가 헤더를 설정하지 않고 이 단계에서 설정을 종료합니다.
            // 요청이 사양의 범위를 벗어납니다.
            if (!ctx.get(HeaderNames.Methods)) {
                // Preflight Request 가 아니므로 무시합니다.
                return await next();
            }

            ctx.set(HeaderNames.Origin, origin);

            if (credentials === true) {
                ctx.set(HeaderNames.Credentials, 'true');
            }

            if (options.maxAge) {
                ctx.set(HeaderNames.MaxAge, options.maxAge);
            }

            if (options.allowMethods) {
                ctx.set(HeaderNames.Methods, options.allowMethods);
            }

            let allowHeaders = options.allowHeaders;
            if (!allowHeaders) {
                allowHeaders = ctx.get(HeaderNames.Headers);
            }
            if (allowHeaders) {
                ctx.set(HeaderNames.Headers, allowHeaders);
            }

            ctx.status = 204; // No Content
        }
    };
};

export default corsMiddleware;