export enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate',
}

export enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
}
export enum signalsFlags {
  IS_REACTIVE = '__isReactive__',
  IS_SHALLOW = '__isShallow__',
  RAW = '__raw__',
  SKIP = '__skip__',
  IS_SIGNAL = '__isSignals__',
  IS_COMPUTED = '__isComputed__',
  IS_REF = '__isRef__',
  IS_EFFECT = '__isEffect__',
}
