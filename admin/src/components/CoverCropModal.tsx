import { useEffect, useRef, useState } from "react";

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => Promise<void>;
}

const ASPECT_RATIO = 3;
const MAX_OUTPUT_WIDTH = 1500;

function initialCrop(width: number, height: number): CropRect {
  if (width / height > ASPECT_RATIO) {
    const cropWidth = height * ASPECT_RATIO;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / ASPECT_RATIO;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível gerar o recorte.")), "image/jpeg", 0.9);
  });
}

export function CoverCropModal({ file, onCancel, onConfirm }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; cropX: number; cropY: number } | null>(null);
  const cancelRef = useRef(onCancel);
  const submittingRef = useRef(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  cancelRef.current = onCancel;
  submittingRef.current = submitting;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) cancelRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function moveCrop(x: number, y: number) {
    if (!crop || !imageRef.current) return;
    const maxX = imageRef.current.clientWidth - crop.width;
    const maxY = imageRef.current.clientHeight - crop.height;
    setCrop({ ...crop, x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, cropX: crop.x, cropY: crop.y };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    moveCrop(drag.cropX + event.clientX - drag.pointerX, drag.cropY + event.clientY - drag.pointerY);
  }

  function handleCropKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!crop || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 2;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const [x, y] = offsets[event.key];
    moveCrop(crop.x + x, crop.y + y);
  }

  async function confirmCrop() {
    const image = imageRef.current;
    if (!image || !crop) return;
    setSubmitting(true);
    setError(null);
    try {
      const scaleX = image.naturalWidth / image.clientWidth;
      const scaleY = image.naturalHeight / image.clientHeight;
      const sourceWidth = crop.width * scaleX;
      const sourceHeight = crop.height * scaleY;
      const outputWidth = Math.max(3, Math.min(MAX_OUTPUT_WIDTH, Math.floor(sourceWidth / 3) * 3));
      const outputHeight = outputWidth / ASPECT_RATIO;
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Seu navegador não oferece suporte ao editor de imagem.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );
      const blob = await canvasBlob(canvas);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "capa";
      await onConfirm(new File([blob], `${baseName}-3x1.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Não foi possível recortar a imagem.");
      setSubmitting(false);
    }
  }

  return (
    <div className="crop-modal-backdrop" role="presentation">
      <section className="crop-modal" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
        <header className="crop-modal-header">
          <div><p className="eyebrow">Imagem de capa</p><h2 id="crop-modal-title">Escolha o enquadramento</h2></div>
          <button type="button" className="button button-quiet" onClick={onCancel} disabled={submitting} aria-label="Fechar editor">×</button>
        </header>
        <p className="crop-modal-instructions">Arraste a área clara sobre a imagem. Apenas o recorte panorâmico 3:1 será enviado.</p>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <div className="crop-stage">
          <div className="crop-image-wrap">
            {sourceUrl && <img
                ref={imageRef}
                src={sourceUrl}
                alt="Imagem completa selecionada para recorte"
                onLoad={(event) => setCrop(initialCrop(event.currentTarget.clientWidth, event.currentTarget.clientHeight))}
              />}
            {crop && <div
              className="crop-selection"
              style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => { dragRef.current = null; }}
              onPointerCancel={() => { dragRef.current = null; }}
              onKeyDown={handleCropKeyDown}
              tabIndex={0}
              aria-label="Área de recorte; use as setas para ajustar"
            ><span>3:1</span></div>}
          </div>
        </div>
        <footer className="crop-modal-actions">
          <button type="button" className="button button-secondary" onClick={onCancel} disabled={submitting}>Cancelar</button>
          <button type="button" className="button button-primary" onClick={confirmCrop} disabled={!crop || submitting}>{submitting ? "Processando..." : "Recortar e enviar"}</button>
        </footer>
      </section>
    </div>
  );
}
