import { memo, useEffect, useRef } from 'react';
import { useT } from '../i18n';

interface ContourChartProps {
  /** contour mẫu (semitone tương đối) */
  reference: readonly number[];
  /** contour của người học, null nếu chưa ghi âm */
  learner: readonly number[] | null;
  label: string;
}

const Y_MIN = -10;
const Y_MAX = 8;

function token(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/**
 * Biểu đồ cao độ vẽ bằng Canvas (TDD: không dùng thư viện biểu đồ nặng).
 * Vẽ lại khi dữ liệu đổi hoặc khi giao diện sáng/tối đổi; nét vẽ sắc nét theo devicePixelRatio.
 */
export const ContourChart = memo(function ContourChart({ reference, learner, label }: ContourChartProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const grid = token(canvas, '--ct-line', '#3d2d23');
      const muted = token(canvas, '--ct-ink-muted', '#a38c76');
      const refColor = token(canvas, '--ct-ink-soft', '#d4b895');
      const accent = token(canvas, '--ct-accent', '#f59e0b');

      const pad = { l: 34, r: 8, t: 10, b: 10 };
      const x = (i: number, n: number) => pad.l + ((w - pad.l - pad.r) * i) / Math.max(1, n - 1);
      const y = (v: number) => pad.t + ((h - pad.t - pad.b) * (Y_MAX - Math.max(Y_MIN, Math.min(Y_MAX, v)))) / (Y_MAX - Y_MIN);

      ctx.font = '12px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [6, 3, 0, -3, -6, -9]) {
        ctx.strokeStyle = grid;
        ctx.lineWidth = v === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, y(v));
        ctx.lineTo(w - pad.r, y(v));
        ctx.stroke();
        ctx.fillStyle = muted;
        ctx.fillText(v > 0 ? `+${v}` : `${v}`, pad.l - 6, y(v));
      }

      const line = (data: readonly number[], color: string, width: number, dash: number[]) => {
        if (data.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(dash);
        ctx.beginPath();
        data.forEach((v, i) => (i ? ctx.lineTo(x(i, data.length), y(v)) : ctx.moveTo(x(i, data.length), y(v))));
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // Mẫu: căn trung bình về 0 để cùng hệ quy chiếu với contour người học
      const mean = (d: readonly number[]) => d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
      const refMean = mean(reference);
      line(
        reference.map((v) => v - refMean),
        refColor,
        3,
        [8, 6]
      );
      if (learner) {
        const lm = mean(learner);
        line(
          learner.map((v) => v - lm),
          accent,
          3.5,
          []
        );
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    // Giao diện sáng/tối đổi qua data-theme trên <html> (ThemeProvider của Shell)
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [reference, learner]);

  return (
    <figure className="m-0">
      <canvas ref={canvasRef} role="img" aria-label={label} className="block h-44 w-full rounded-xl bg-sunken" />
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-0 w-6 border-t-[3px] border-dashed border-ink-soft" /> {t('legendSample')}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-0 w-6 border-t-[3px] border-accent" /> {t('legendYou')}
        </span>
        <span className="text-ink-muted">{t('yAxis')}</span>
      </figcaption>
    </figure>
  );
});
