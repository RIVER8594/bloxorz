// 上下连续的竖井图片共用于两版游戏；过关时背景向下滚动一整幅。
const LEVEL_TRANSITION_MS = 2000;

class EscapeRoomBackground {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'environment-background';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.staticCanvas = document.createElement('canvas');
    this.level = 0;
    this.ascent = null;
    this.scrollOffset = 0;
    this.lastPaint = -Infinity;
    this.crossfade = null;
    this.rooms = [
      { name: '石牢密室', source: 'assets/backgrounds/room-01-stone-loop.png', haze: '70, 120, 145' },
      { name: '炼金密室', source: 'assets/backgrounds/room-02-alchemy-loop.png', haze: '107, 88, 145' },
      { name: '机械监牢', source: 'assets/backgrounds/room-03-clockwork-loop.png', haze: '107, 127, 135' }
    ];
    this.resize();
    this.rooms.forEach((room, index) => {
      room.image = new Image();
      room.image.onload = () => {
        room.loaded = true;
        this.rebuild();
      };
      room.image.onerror = () => {
        room.failed = true;
        console.error(`密室背景加载失败：${room.source}`);
        if (this.level === index) this.rebuild();
      };
      room.image.src = room.source;
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  setLevel(index, animate = true) {
    const next = Math.max(0, Math.min(this.rooms.length - 1, index));
    this.crossfade = next !== this.level && animate ? { from: this.level, start: performance.now() } : null;
    this.level = next;
    this.ascent = null;
    this.scrollOffset = 0;
    this.lastPaint = -Infinity;
    this.draw(performance.now());
  }

  beginAscent(startTime, duration = LEVEL_TRANSITION_MS, nextLevel = this.level) {
    this.ascent = {
      startTime,
      duration,
      nextLevel: Math.max(0, Math.min(this.rooms.length - 1, nextLevel))
    };
    this.lastPaint = -Infinity;
  }

  finishAscent() {
    this.ascent = null;
    this.scrollOffset = 0;
    this.lastPaint = -Infinity;
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.container.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.container.clientHeight * ratio));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = this.staticCanvas.width = width;
    this.canvas.height = this.staticCanvas.height = height;
    this.rebuild();
  }

  rebuild() {
    const width = this.staticCanvas.width;
    const height = this.staticCanvas.height;
    for (const room of this.rooms) {
      if (!room.tile) room.tile = document.createElement('canvas');
      room.tile.width = width;
      room.tile.height = height;
      const ctx = room.tile.getContext('2d');
      ctx.fillStyle = '#070e16';
      ctx.fillRect(0, 0, width, height);
      if (!room.loaded) continue;

      // 等比铺满窗口：根据宽、高中较大的缩放比例居中裁切，避免两侧留黑。
      // 为上下滚动保留窄融合带，重复周期仍严格等于一屏高度。
      const overlap = Math.max(2, Math.round(height * 0.045));
      const scale = Math.max(width / room.image.naturalWidth, (height + overlap) / room.image.naturalHeight);
      const imageWidth = room.image.naturalWidth * scale;
      const imageHeight = room.image.naturalHeight * scale;
      const imageX = (width - imageWidth) / 2;
      const imageY = (height + overlap - imageHeight) / 2;
      ctx.drawImage(room.image, imageX, imageY - overlap, imageWidth, imageHeight);
      const seam = document.createElement('canvas');
      seam.width = width;
      seam.height = overlap;
      const seamCtx = seam.getContext('2d');
      seamCtx.drawImage(room.image, imageX, imageY, imageWidth, imageHeight);
      seamCtx.globalCompositeOperation = 'destination-in';
      const mask = seamCtx.createLinearGradient(0, 0, 0, overlap);
      mask.addColorStop(0, 'rgba(0, 0, 0, 0)');
      mask.addColorStop(1, 'rgba(0, 0, 0, 1)');
      seamCtx.fillStyle = mask;
      seamCtx.fillRect(0, 0, width, overlap);
      ctx.drawImage(seam, 0, height - overlap);
    }
    this.lastPaint = -Infinity;
    this.draw(performance.now());
  }

  drawRoom(room, offset, opacity = 1) {
    if (!room.tile) return;
    const height = this.canvas.height;
    const y = offset % height;
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(room.tile, 0, y - height);
    this.ctx.drawImage(room.tile, 0, y);
    this.ctx.globalAlpha = 1;
  }

  draw(timestamp) {
    // 静止时轻雾限频，飞升时每帧滚动；原图仅在加载、缩放时合成。
    if (!this.ascent && !this.crossfade && timestamp - this.lastPaint < 1000 / 15) return;
    this.lastPaint = timestamp;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const room = this.rooms[this.level];
    let blend = 0;
    if (this.ascent) {
      const progress = Math.max(0, Math.min((timestamp - this.ascent.startTime) / this.ascent.duration, 1));
      const ease = progress * progress * (3 - 2 * progress);
      this.scrollOffset = ease * height;
      // 末段平滑过渡至下一关的同位置背景，切关时不会突然换图。
      const fade = Math.max(0, Math.min((progress - 0.7) / 0.3, 1));
      blend = fade * fade * (3 - 2 * fade);
    }
    if (this.crossfade) {
      const t = Math.min((timestamp - this.crossfade.start) / 700, 1);
      this.drawRoom(this.rooms[this.crossfade.from], 0);
      this.drawRoom(room, 0, Math.max(0, t));
      if (t >= 1) this.crossfade = null;
    } else this.drawRoom(room, this.scrollOffset);
    if (blend > 0 && this.ascent.nextLevel !== this.level) {
      const nextRoom = this.rooms[this.ascent.nextLevel];
      if (nextRoom.loaded) this.drawRoom(nextRoom, this.scrollOffset, blend);
    }
    this.canvas.dataset.room = room.name;
    this.canvas.dataset.imageState = room.loaded ? 'ready' : room.failed ? 'failed' : 'loading';
    this.canvas.dataset.scrollOffset = String(this.scrollOffset / height);
    const time = timestamp / 1000;
    for (let i = 0; i < 3; i++) {
      const x = width / 2 + Math.sin(time * 0.12 + i * 2.1) * height * 0.17;
      const y = (height * (0.72 + i * 0.09) + this.scrollOffset) % height;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(height / 750, height / 750);
      ctx.scale(2.8, 0.45);
      const haze = ctx.createRadialGradient(0, 0, 8, 0, 0, 140);
      haze.addColorStop(0, `rgba(${this.rooms[this.level].haze}, 0.035)`);
      haze.addColorStop(1, `rgba(${this.rooms[this.level].haze}, 0)`);
      ctx.fillStyle = haze;
      ctx.fillRect(-140, -140, 280, 280);
      ctx.restore();
    }
  }
}
