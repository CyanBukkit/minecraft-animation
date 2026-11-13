import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { validateProject } from '../core/project.js';
import { muxWebM } from './webm.js';

export function validateRenderOptions(project, { url, output, width = 640, height = 360 } = {}) {
  validateProject(project);
  if (![width, height].every(value => Number.isInteger(value) && value >= 64 && value <= 3840)) throw new Error('渲染宽高应为 64–3840 的整数');
  if (typeof output !== 'string' || !output.trim()) throw new Error('需要新的渲染输出目录');
  const address = new URL(url);
  if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || address.username || address.password) throw new Error('渲染仅连接本机 preview 服务');
  const frameCount = Math.ceil(project.duration * project.fps);
  return { width, height, frameCount, duration: frameCount / project.fps };
}

/** Deterministic offline sampling and VP8 encoding, independent of wall-clock rendering speed. */
export async function renderProject(project, options = {}) {
  const { width, height, frameCount, duration } = validateRenderOptions(project, options);
  const output = path.resolve(options.output);
  await mkdir(output); // Existing output is never overwritten.
  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true, executablePath: options.browserExecutable, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
    } catch (error) {
      throw new Error('无法启动 Chromium。运行 npx playwright install chromium，或传 --browser-executable 指定浏览器。' + error.message);
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(90000);
    await page.goto(options.url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.studioReady === 'true');
    const chunks = [];
    await page.exposeFunction('__mcaEncodedChunk', chunk => chunks.push({ timestamp: chunk.timestamp, type: chunk.type, data: Buffer.from(chunk.base64, 'base64') }));
    await page.evaluate(async projectData => { await window.mcStudio.setProject(projectData); }, project);
    await page.waitForLoadState('networkidle');
    const result = await page.evaluate(async ({ width, height, fps, frameCount }) => {
      if (!globalThis.VideoEncoder || !globalThis.VideoFrame) throw new Error('当前浏览器没有 WebCodecs 视频编码能力');
      const api = window.mcStudio;
      if (api.prepareRender) await api.prepareRender(width, height);
      else {
        api.pause(); api.renderer.setAnimationLoop(null); api.setCameraMode('cinematic');
        api.renderer.setPixelRatio(1); api.renderer.setSize(width, height, false);
        api.camera.aspect = width / height; api.camera.updateProjectionMatrix();
      }
      const canvas = api.renderer.domElement;
      const config = { codec: 'vp8', width, height, bitrate: Math.max(500000, width * height * 8), framerate: fps, latencyMode: 'quality' };
      if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('当前 Chromium 不支持 VP8 编码');
      const transfers = [];
      let failure;
      let encoded = 0;
      const encoder = new VideoEncoder({
        output(chunk) {
          const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes);
          let binary = '';
          for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
          transfers.push(window.__mcaEncodedChunk({ timestamp: chunk.timestamp, type: chunk.type, base64: btoa(binary) }));
          encoded++;
        },
        error(error) { failure = error; },
      });
      encoder.configure(config);
      let poster;
      try {
        for (let index = 0; index < frameCount; index++) {
          if (failure) throw failure;
          api.seek(index / fps);
          if (canvas.width !== width || canvas.height !== height) throw new Error('渲染画布尺寸发生变化');
          if (index === 0) poster = canvas.toDataURL('image/png').split(',')[1];
          const timestamp = Math.round(index * 1000000 / fps);
          const frame = new VideoFrame(canvas, { timestamp, duration: Math.round((index + 1) * 1000000 / fps) - timestamp });
          try { encoder.encode(frame, { keyFrame: index % fps === 0 }); } finally { frame.close(); }
          if (encoder.encodeQueueSize >= 8) await encoder.flush();
        }
        await encoder.flush();
        await Promise.all(transfers);
        if (failure) throw failure;
        if (encoded !== frameCount) throw new Error('编码帧数与采样帧数不符');
        return { encoded, poster };
      } finally { if (encoder.state !== 'closed') encoder.close(); }
    }, { width, height, fps: project.fps, frameCount });
    if (chunks.length !== frameCount) throw new Error('视频编码数据传输不完整');
    const movie = muxWebM(chunks, { width, height, fps: project.fps });
    const decoded = await page.evaluate(async ({ base64, expected }) => {
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
      const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.src = url;
      const waitForVideo = event => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('导出 WebM 解码超时')); }, 15000);
        const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, ready); video.removeEventListener('error', failed); };
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('导出 WebM 无法解码')); };
        video.addEventListener(event, ready, { once: true }); video.addEventListener('error', failed, { once: true });
      });
      try {
        await waitForVideo('loadedmetadata');
        if (video.videoWidth !== expected.width || video.videoHeight !== expected.height || Math.abs(video.duration - expected.duration) > 0.01) throw new Error('导出 WebM 尺寸或时长验收失败');
        const seeked = waitForVideo('seeked'); video.currentTime = Math.max(0, expected.duration - 1 / expected.fps); await seeked;
        const canvas = document.createElement('canvas'); canvas.width = expected.width; canvas.height = expected.height;
        const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, lastFrameDecoded: true };
      } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
    }, { base64: movie.toString('base64'), expected: { width, height, duration, fps: project.fps } });
    const receipt = { frameCount, fps: project.fps, width, height, duration, codec: 'VP8', container: 'WebM', audio: false, bytes: movie.length, decoded, files: ['movie.webm', 'poster.png'] };
    await writeFile(path.join(output, 'movie.webm'), movie, { flag: 'wx' });
    await writeFile(path.join(output, 'poster.png'), Buffer.from(result.poster, 'base64'), { flag: 'wx' });
    await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + String.fromCharCode(10), { flag: 'wx' });
    return receipt;
  } finally { await browser?.close(); }
}
