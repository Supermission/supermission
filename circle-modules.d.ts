// Type stubs for optional Circle SDK packages (not installed)
declare module '@circle-fin/x402-batching' {
  export function supportsBatching(requirements: any): boolean;
}

declare module '@circle-fin/x402-batching/server' {
  export class BatchFacilitatorClient {
    verify(payload: any, requirements: any): Promise<any>;
    settle(payload: any, requirements: any): Promise<any>;
  }
}

declare module '@circle-fin/bridge-kit' {
  export class BridgeKit {
    constructor();
    [key: string]: any;
  }
}
