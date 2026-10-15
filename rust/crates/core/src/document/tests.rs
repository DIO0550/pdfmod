use super::*;
use crate::{object::ObjectKind, page_tree::warning::PageTreeWarning, PageNumber};

mod access;
mod contents;
mod lazy;
mod malformed;

struct PdfFixture {
    data: Vec<u8>,
    entries: Vec<usize>,
}

impl PdfFixture {
    fn new(root: &str) -> Self {
        let mut pdf = Self {
            data: b"%PDF-1.7\n".to_vec(),
            entries: Vec::new(),
        };
        pdf.object("<< /Type /Catalog /Pages 2 0 R >>");
        pdf.object(root);
        pdf
    }

    fn object(&mut self, body: &str) {
        self.entries.push(self.data.len());
        let number = self.entries.len();
        self.data
            .extend_from_slice(format!("{number} 0 obj\n{body}\nendobj\n").as_bytes());
    }

    fn finish(mut self, trailer: &str) -> Vec<u8> {
        let offset = self.data.len();
        let size = self.entries.len() + 1;
        self.data
            .extend_from_slice(format!("xref\n0 {size}\n0000000000 65535 f\n").as_bytes());
        for position in self.entries {
            self.data
                .extend_from_slice(format!("{position:010} 00000 n\n").as_bytes());
        }
        self.data.extend_from_slice(
            format!(
                "trailer\n<< /Size {size} /Root 1 0 R {trailer} >>\nstartxref\n{offset}\n%%EOF\n"
            )
            .as_bytes(),
        );
        self.data
    }

    fn one_page(contents: &str) -> Self {
        let mut pdf =
            Self::new("<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 600 800] >>");
        pdf.object(&format!("<< /Type /Page /Parent 2 0 R {contents} >>"));
        pdf
    }
}
