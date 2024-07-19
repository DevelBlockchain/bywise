import { BywiseNode } from '@bywise/web3';
import ws from 'ws';

export type WSRequest = {
  id: string;
  broadcast?: boolean;
  path: string;
  method: string;
  token?: string;
  params: { [key: string]: string };
  query: { [key: string]: string };
  body: any;
}

export type WSResponse = {
  id: string;
  status: number;
  body: any;
}

export class WSNode {
  socket: ws.WebSocket;
  strikes: number = 0;
  ip: string;
  node?: BywiseNode;

  constructor(socket: ws.WebSocket, ip: string) {
    this.socket = socket;
    this.ip = ip;
  }
}