export const BEND_CHANNELS = ['leftArm.bend', 'rightArm.bend', 'leftLeg.bend', 'rightLeg.bend'];
export const FACE_CHANNELS = ['face.leftBlink', 'face.rightBlink', 'face.lookX', 'face.lookY', 'face.mouthOpen', 'face.smile', 'face.brow'];
export const MAX_BEND = Math.PI * 0.75;
export const EXPRESSIONS = {
  neutral: { label: '自然', values: {} },
  happy: { label: '开心', values: { 'face.smile': 0.9, 'face.brow': 0.2 } },
  angry: { label: '生气', values: { 'face.brow': -0.9, 'face.smile': -0.5 } },
  surprised: { label: '惊讶', values: { 'face.brow': 0.9, 'face.mouthOpen': 0.8 } },
  blink: { label: '闭眼', values: { 'face.leftBlink': 1, 'face.rightBlink': 1 } },
  wink: { label: '眨右眼', values: { 'face.rightBlink': 1, 'face.smile': 0.5 } },
};

export function channelRange(channel) {
  if (BEND_CHANNELS.includes(channel)) return [0, MAX_BEND];
  if (FACE_CHANNELS.includes(channel)) return ['face.lookX', 'face.lookY', 'face.smile', 'face.brow'].includes(channel) ? [-1, 1] : [0, 1];
  return null;
}
