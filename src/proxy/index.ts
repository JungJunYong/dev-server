import Koa from 'koa';
import { ProxyServer, ProxyMiddlewareOptions, ProxyContextInterface } from './ProxyServer';

const middleware = (options: ProxyMiddlewareOptions): Koa.Middleware => {
    const proxy = new ProxyServer(options);
    return proxy.middleware;
};

export default middleware;
export { ProxyMiddlewareOptions, ProxyContextInterface };
