export type HotApi<TData extends object = Record<string, unknown>> = {
  data?: TData;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
  dispose?: (cb: (data: TData) => void) => void;
};

type ImportMetaWithHotApi = ImportMeta & {
  hot?: HotApi;
  webpackHot?: HotApi;
};

export function getHotApi<TData extends object = Record<string, unknown>>(source: ImportMeta) {
  const meta = source as ImportMetaWithHotApi;
  return (meta.webpackHot ?? meta.hot) as HotApi<TData> | undefined;
}

declare global {
  interface ImportMeta {
    webpackHot?: HotApi;
  }
}
