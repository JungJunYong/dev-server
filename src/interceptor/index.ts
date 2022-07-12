import { Middleware } from 'koa';
import { Interceptor, InterceptorMiddlewareOptions } from './Interceptor';

const middleware = (options?: InterceptorMiddlewareOptions): Middleware => {
    const interceptor = new Interceptor(options);
    return interceptor.middleware;
};

export default middleware;
export { InterceptorMiddlewareOptions };
