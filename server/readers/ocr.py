#!/usr/bin/env python3
"""OCR de páginas de encarte com RapidOCR (PP-OCRv5 mobile, alfabeto latino), só na CPU.

Uso: python ocr.py <arquivo> [<arquivo> ...]
Cada arquivo é imagem (jpg, png, webp) ou PDF. PDF vira uma imagem por página, a 2,5x.
Saída (stdout, JSON): lista com um item por página lida, na ordem dos arquivos:
  {"arquivo": str, "pagina": int (1 em imagem), "w": int, "h": int,
   "linhas": [{"t": texto, "box": [x0, y0, x1, y1]}]}   (box em pixels da imagem lida)
Se uma página falhar, o item traz "erro" no lugar de "linhas" e as outras seguem.
O modelo é carregado uma vez por chamada: passe várias páginas de uma vez.
Os modelos ONNX são baixados na primeira vez para <pacote rapidocr>/models (o workflow guarda essa pasta em cache).
"""
import os
import sys
import json

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')  # nunca usa GPU

ESCALA_PDF = 2.5


def carregar():
    from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
    params = {
        'Global.use_cls': False,
        'Det.ocr_version': OCRVersion.PPOCRV5, 'Det.model_type': ModelType.MOBILE,
        'Rec.ocr_version': OCRVersion.PPOCRV5, 'Rec.model_type': ModelType.MOBILE, 'Rec.lang_type': LangRec.LATIN,
        'EngineConfig.onnxruntime.intra_op_num_threads': max(1, min(4, os.cpu_count() or 1)),
        'EngineConfig.onnxruntime.inter_op_num_threads': 1,
    }
    return RapidOCR(params=params)


def paginas(arq):
    """Gera (numero da página, imagem numpy BGR) de uma imagem ou PDF. O RapidOCR espera BGR (padrão do OpenCV): em RGB ele perdeu textos coloridos."""
    import numpy as np
    if open(arq, 'rb').read(4) == b'%PDF':
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(arq)
        try:
            for i in range(len(pdf)):
                yield i + 1, np.asarray(pdf[i].render(scale=ESCALA_PDF).to_pil().convert('RGB'))[:, :, ::-1]
        finally:
            pdf.close()
    else:
        from PIL import Image
        yield 1, np.asarray(Image.open(arq).convert('RGB'))[:, :, ::-1]


def ler(motor, img):
    r = motor(img)
    linhas = []
    if r.boxes is not None and r.txts:
        for b, t in zip(r.boxes, r.txts):
            t = (t or '').strip()
            if not t:
                continue
            xs = [p[0] for p in b]
            ys = [p[1] for p in b]
            linhas.append({'t': t, 'box': [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]})
    return linhas


def main():
    arquivos = sys.argv[1:]
    if not arquivos:
        sys.exit('uso: python ocr.py <imagem-ou-pdf> [...]')
    motor = carregar()
    saida = []
    for arq in arquivos:
        try:
            for n, img in paginas(arq):
                h, w = img.shape[:2]
                try:
                    saida.append({'arquivo': arq, 'pagina': n, 'w': w, 'h': h, 'linhas': ler(motor, img)})
                except Exception as e:  # uma página ruim não derruba as outras
                    saida.append({'arquivo': arq, 'pagina': n, 'w': w, 'h': h, 'erro': str(e)[:300]})
        except Exception as e:
            saida.append({'arquivo': arq, 'pagina': 1, 'erro': str(e)[:300]})
    sys.stdout.reconfigure(encoding='utf-8')
    json.dump(saida, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
