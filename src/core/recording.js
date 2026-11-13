/** 实时画布录制，无服务器，不承诺离线逐帧或音频导出。 */
export function getRecordingType() {
  if (!globalThis.MediaRecorder) return null;
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || null;
}
export function startRecording(canvas, fps, onFinish, onError) {
  const mimeType = getRecordingType();
  if (!mimeType || !canvas.captureStream) throw new Error('当前浏览器不支持 WebM 录制，请使用桌面版 Chrome / Edge');
  const stream = canvas.captureStream(fps);
  let recorder;
  try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 }); }
  catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  const chunks = [];
  let failed = false;
  recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
  recorder.onerror = () => { failed = true; stream.getTracks().forEach(track => track.stop()); onError(new Error('浏览器录制失败，请减少窗口尺寸后重试')); };
  recorder.onstop = () => {
    stream.getTracks().forEach(track => track.stop());
    if (!failed) onFinish(new Blob(chunks, { type: mimeType }));
  };
  try { recorder.start(250); }
  catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  return { stop() { if (recorder.state !== 'inactive') recorder.stop(); }, get active() { return recorder.state !== 'inactive'; } };
}
