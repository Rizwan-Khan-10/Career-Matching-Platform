import io
import unittest
from app.services import pdf_converter as pc


class ConverterTest(unittest.TestCase):
    def test_detection_beats_file_name(self):
        from reportlab.pdfgen import canvas
        b = io.BytesIO(); c = canvas.Canvas(b); c.drawString(10, 10, "x"); c.save()
        self.assertEqual(pc.detect_kind(b.getvalue(), "resume.docx"), "pdf")
        self.assertEqual(pc.detect_kind(b"hello world", "notes.txt"), "text")
        self.assertEqual(pc.detect_kind(bytes(range(256)), "x.bin"), "unknown")

    def test_image_becomes_single_a4_pdf(self):
        from PIL import Image
        from pypdf import PdfReader
        buf = io.BytesIO(); Image.new("RGB", (600, 900), "white").save(buf, "PNG")
        pdf, how = pc.to_pdf(buf.getvalue(), "scan.png")
        self.assertEqual(how, "image")
        r = PdfReader(io.BytesIO(pdf))
        self.assertEqual(len(r.pages), 1)
        self.assertAlmostEqual(float(r.pages[0].mediabox.width), 595.27, places=0)

    def test_text_is_escaped(self):
        from pypdf import PdfReader
        pdf, how = pc.to_pdf(b"A <b>bold</b> & more", "cv.txt")
        self.assertEqual(how, "text")
        self.assertIn("<b>bold</b>", PdfReader(io.BytesIO(pdf)).pages[0].extract_text())

    def test_bad_inputs_raise_conversion_error(self):
        for data, name in [(b"", "a.pdf"), (bytes(range(256)) * 4, "a.bin"), (b"\x89PNG\r\n\x1a\nnot really", "a.png")]:
            with self.assertRaises(pc.ConversionError):
                pc.to_pdf(data, name)


if __name__ == "__main__":
    unittest.main()