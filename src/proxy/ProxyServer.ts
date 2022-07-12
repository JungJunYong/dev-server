import { EventEmitter } from 'events';
import http from 'http';
import httpProxy from 'http-proxy';
import Koa, { DefaultState, ParameterizedContext } from 'koa';
import net from 'net';

export type KoaContextForProxy = ParameterizedContext<DefaultState, ProxyContextInterface>;

export interface ProxyContextInterface {
    oldPath?: string;
    req: {
        connection: {
            server: http.Server;
        };
    };
}
/**
 * 프록시 기능을 위한 미들웨어의 설정 옵션입니다.
 */
export interface ProxyMiddlewareOptions extends httpProxy.ServerOptions {
    /** 프록시 서버의 URL 을 설정합니다. */
    target: string;
    /**
     * Proxy 서버로 요청할 URL을 재설정하는 함수입니다.
     * @param path 원본 요청 경로
     * @param ctx Koa Context
     * @returns 실제 프록시 서버로 요청할 경로
     */
    rewrite?: (path: string, ctx: KoaContextForProxy) => string;
    /**
     * 로그를 작성하는지 여부를 설정하거나 로그 작성을 위한 로직을 설정합니다.
     */
    logs?: false | ((ctx: KoaContextForProxy, target: string) => void);

    /**
     * 웹 소켓 관련 로그를 작성하는지 여부를 설정하거나 로그 작성을 위한 로직을 설정합니다.
     */
    logsWs?: false | ((ctx: KoaContextForProxy, type: string, target: string) => void);
    /**
     * 이벤트 핸들러
     */
    events?: ProxyMiddlewareEvents;
    /**
     * 프록시 연결을 사용할지 여부를 판단하는 함수입니다.
     * @param ctx Koa Context
     */
    filter?: (ctx: KoaContextForProxy) => boolean;
}

interface ProxyMiddlewareEvents {
    /**
     * `error` 이벤트 핸들러
     * @param err Error 객체
     * @param req Request 객체
     * @param res Response 객체
     */
    error?: (err: Error, req: http.IncomingMessage, res: http.OutgoingMessage) => void;
    /**
     * 프록시 연결에서 데이터를 보내기 전에 발생하는 `proxyReq` 이벤트 핸들러
     * @param proxyReq 프록시로 전송할 Request 객체
     * @param req Request 객체
     * @param res Response 객체
     * @param options 설정 옵션
     */
    proxyReq?: (
        proxyReq: http.ClientRequest,
        req: http.IncomingMessage,
        res: http.ServerResponse,
        options?: ProxyMiddlewareOptions
    ) => void;
    /**
     * 웹소켓 프록시 연결에서 데이터를 보내기 전에 발생하는 `proxyReq` 이벤트 핸들러
     * @param proxyReq 프록시로 전송할 Request 객체
     * @param req Request 객체
     * @param socket Socket 객체
     * @param options 설정 옵션
     * @param head Head 객체
     */
    proxyReqWs?: (
        proxyReq: http.ClientRequest,
        req: http.IncomingMessage,
        socket: net.Socket,
        options?: ProxyMiddlewareOptions,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head?: any
    ) => void;
    /**
     * 프록시 연결 요청에 대한 응답이 있을 때 발생하는 `proxyRes` 이벤트 핸들러
     * @param proxyRes 프록시 서버로 부터 전송된 Response 객체
     * @param req Request 객체
     * @param res Response 객체
     */
    proxyRes?: (proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse) => void;
    /**
     * 프록시 연결에서 웹소켓이 생성되어 대상 웹소켓으로 파이프되면 발생하는 `open` 이벤트 핸들러
     * @param proxySocket 프록시 소켓 객체
     */
    open?: (proxySocket: net.Socket) => void;
    /**
     * 프록시 연결에서 웹소켓이 닫히면 발생하는 `close` 이벤트 핸들러
     * @param proxyRes 프록시 Response 객체
     * @param proxySocket 프록시 Socket 객체
     * @param proxyHead 프록시 Head 객체
     */
    close?: (
        proxyRes: http.IncomingMessage,
        proxySocket: net.Socket,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proxyHead: any
    ) => void;
}

/**
 * 프록시 서버를 구현하는 클래스입니다.
 */
export class ProxyServer {
    private readonly proxy: httpProxy;
    private readonly httpProxyOptions: httpProxy.ServerOptions;
    private websocketIsRegistered = false;
    private events = new EventEmitter();

    constructor(private options: ProxyMiddlewareOptions) {
        this.httpProxyOptions = Object.keys(options)
            .filter((item) => ['logs', 'rewrite', 'events', 'filter'].indexOf(item) < 0)
            .reduce((prev, curr) => {
                prev[curr] = options[curr];
                return prev;
            }, {}) as httpProxy.ServerOptions;

        this.proxy = httpProxy.createProxyServer();

        // http-proxy 이벤트 등록
        this.proxy.on(
            'proxyRes',
            (proxyRes?: http.IncomingMessage, req?: http.IncomingMessage, res?: http.ServerResponse) => {
                // 프록시 응답에서 Redirect 가 발생할 때 location 을 현재 서버 경로로 바꿔준다.
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    if (proxyRes.headers.location.startsWith(options.target)) {
                        proxyRes.headers.location = proxyRes.headers.location.replace(
                            options.target.replace(/\/$/, ''),
                            `http://${req.headers.host}`
                        );
                    }
                }

                options.events?.proxyRes?.call(this, proxyRes, req, res);
            }
        );

        // http-proxy 프록시 서버 객체이 직접 핸들러를 등록한 이벤트를 제외하고
        // 옵션에서 전달된 이벤트 핸들러를 이벤트에 등록
        if (this.options.events && typeof this.options.events === 'object') {
            Object.entries(options.events)
                .filter((item) => ['proxyRes'].indexOf(item[0]) < 0)
                .forEach(([ev, handler]) => {
                    this.proxy.on(ev, handler as () => void);
                });
        }

        this.events.on(
            'logsWs',
            /* istanbul ignore next */ (ctx, type, target) => {
                if (typeof this.options.logsWs === 'function') {
                    const url = new URL(target, this.options.target);
                    url.protocol = 'ws://';
                    this.options.logsWs.call(this, ctx, type, url.toString());
                }
            }
        );
    }

    /**
     * Koa 미들웨어를 가져옵니다.
     */
    get middleware(): Koa.Middleware {
        return (ctx: KoaContextForProxy, next: Koa.Next) => {
            if (typeof this.options.filter === 'function') {
                if (!this.options.filter(ctx)) {
                    return next();
                }
            }
            if (this.options.logs) {
                typeof this.options.logs === 'function' ? this.options.logs(ctx, this.options.target) : undefined;
            }
            return this.relay(ctx);
        };
    }

    private relay(ctx: KoaContextForProxy): Promise<void> {
        ctx.oldPath = ctx.req.url;

        return new Promise<void>((resolve, rejects) => {
            ctx.res.on('close', () => {
                rejects(new Error(`Http response closed while proxying ${ctx.oldPath}`));
            });
            ctx.res.on('finish', () => {
                resolve();
            });
            this.proxy.web(ctx.req, ctx.res, this.httpProxyOptions, (err: Error & { code: string }) => {
                // noinspection SpellCheckingInspection
                const status = {
                    ECONNREFUSED: 503,
                    ETIMEOUT: 504
                }[err.code];
                ctx.status = status || 500;
                resolve();
            });
            if (this.options.ws && !this.websocketIsRegistered) {
                if (!this.websocketIsRegistered) {
                    this.proxy.on(
                        'proxyReqWs',
                        /* istanbul ignore next */ (proxyReq, req, socket) => {
                            const reqUrl = req.url;
                            this.events.emit('logsWs', ctx, 'open', reqUrl);

                            proxyReq.on('upgrade', (proxyRes, proxySocket) => {
                                proxySocket.on('data', () => {
                                    this.events.emit('logsWs', ctx, 'receive', reqUrl);
                                });
                            });

                            proxyReq.on('end', () => {
                                this.events.emit('logsWs', ctx, 'close', reqUrl);
                            });

                            socket.on('data', () => {
                                this.events.emit('logsWs', ctx, 'send', reqUrl);
                            });

                            socket.on('end', () => {
                                this.events.emit('logsWs', ctx, 'close', reqUrl);
                            });
                        }
                    );
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ctx.req.connection.server.on(
                    'upgrade',
                    /* istanbul ignore next */ (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
                        console.log('upgrade');
                        this.proxy.ws(req, socket, head, this.httpProxyOptions, (e: Error) => {
                            console.log('Websocket Error', e.message, e.stack);
                            resolve();
                        });
                    }
                );
                this.websocketIsRegistered = true;
            }
        });
    }
}
