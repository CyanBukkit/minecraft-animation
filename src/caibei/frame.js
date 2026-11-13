/**
 * 类似 Remotion 的 useCurrentFrame，但是没有 React。
 * 只在片段的 sample() 被编译或采样时有效。
 */

const stack = [];

export function pushFrame(context) {
  stack.push(context);
}
export function popFrame() {
  stack.pop();
}
function current() {
  const frame = stack[stack.length - 1];
  if (!frame) throw new Error('useCurrentFrame / useCurrentTime / useProject 只能在片段的 sample() 里调用');
  return frame;
}

/** 当前项目帧号，从 0 开始，按作品的 fps 计算。 */
export function useCurrentFrame() {
  return current().frame;
}
/** 当前时间，单位秒。 */
export function useCurrentTime() {
  return current().time;
}
/** 正在编译的作品：名称、帧率、时长。 */
export function useProject() {
  return current().project;
}
