import { EventsGateway, roomOf } from './events.gateway';

function client(auth: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
    return { handshake: { auth, query }, join: jest.fn(), disconnect: jest.fn() };
}

describe('EventsGateway', () => {
    const jwt = { verify: jest.fn() };
    let gateway: EventsGateway;

    beforeEach(() => {
        jwt.verify.mockReset();
        gateway = new EventsGateway(jwt as any);
    });

    it('puts a connection with a valid token into the room user:<sub>', () => {
        jwt.verify.mockReturnValue({ sub: 'u1', role: 'APPLICANT' });
        const c = client({ token: 'good' });
        gateway.handleConnection(c as any);

        expect(jwt.verify).toHaveBeenCalledWith('good', { secret: process.env.JWT_SECRET });
        expect(c.join).toHaveBeenCalledWith('user:u1');
        expect(c.disconnect).not.toHaveBeenCalled();
    });

    it('also accepts the token in the query string', () => {
        jwt.verify.mockReturnValue({ sub: 'u1' });
        const c = client({}, { token: 'from-query' });
        gateway.handleConnection(c as any);
        expect(jwt.verify).toHaveBeenCalledWith('from-query', expect.anything());
        expect(c.join).toHaveBeenCalledWith('user:u1');
    });

    it('disconnects a connection with a bad or missing token', () => {
        jwt.verify.mockImplementation(() => {
            throw new Error('invalid signature');
        });
        const c = client({ token: 'bad' });
        gateway.handleConnection(c as any);
        expect(c.disconnect).toHaveBeenCalled();
        expect(c.join).not.toHaveBeenCalled();
    });

    it('disconnects a token that has no subject', () => {
        jwt.verify.mockReturnValue({ role: 'ADMIN' });
        const c = client({ token: 'no-sub' });
        gateway.handleConnection(c as any);
        expect(c.disconnect).toHaveBeenCalled();
        expect(c.join).not.toHaveBeenCalled();
    });

    it('pushToUser emits to the room of that user only', () => {
        const emit = jest.fn();
        const to = jest.fn().mockReturnValue({ emit });
        (gateway as any).server = { to };
        gateway.pushToUser('u1', 'notification.created', { userId: 'u1' });

        expect(to).toHaveBeenCalledWith(roomOf('u1'));
        expect(emit).toHaveBeenCalledWith('notification.created', { userId: 'u1' });
    });

    it('pushToUser throws while the socket server is not ready (so the consumer retries)', () => {
        expect(() => gateway.pushToUser('u1', 'x', {})).toThrow('socket server is not ready');
    });
});