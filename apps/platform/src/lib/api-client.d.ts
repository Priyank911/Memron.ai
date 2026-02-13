export declare const api: {
    tunnels: {
        list: () => Promise<any[]>;
        create: (data: any) => Promise<unknown>;
        get: (id: string) => Promise<unknown>;
    };
    drops: {
        list: () => Promise<any[]>;
        accept: (id: string) => Promise<unknown>;
        reject: (id: string) => Promise<unknown>;
    };
    access: {
        grants: () => Promise<any[]>;
        issue: (data: any) => Promise<unknown>;
        revoke: (id: string) => Promise<unknown>;
    };
    trust: {
        scores: () => Promise<any[]>;
        profile: (did: string) => Promise<unknown>;
    };
    memory: {
        search: (q: string, bucket?: string) => Promise<unknown>;
        get: (cid: string) => Promise<unknown>;
    };
};
//# sourceMappingURL=api-client.d.ts.map