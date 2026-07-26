import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'] },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: unknown) {
    return { event: 'pong', data, userId: client.data.userId };
  }

  emitCampus(campusId: string, event: string, payload: unknown) {
    this.server.to(`campus:${campusId}`).emit(event, payload);
  }
}
