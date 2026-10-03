use super::*;
use crate::object::object_number::ObjectNumber;

mod basic;
mod compressed;

fn reference(number: u64, generation: u16) -> IndirectRef {
    IndirectRef::new(ObjectId::new(
        ObjectNumber::new(number).unwrap(),
        GenerationNumber::new(generation),
    ))
}

#[derive(Default)]
struct PdfFixture {
    data: Vec<u8>,
    entries: Vec<(u64, usize, u16)>,
}
impl PdfFixture {
    fn new() -> Self {
        Self {
            data: b"%PDF-1.7\n".to_vec(),
            entries: Vec::new(),
        }
    }
    fn object(&mut self, number: u64, generation: u16, body: &str) -> usize {
        let offset = self.data.len();
        self.entries.push((number, offset, generation));
        self.data
            .extend_from_slice(format!("{number} {generation} obj\n{body}\nendobj\n").as_bytes());
        offset
    }
    fn finish(mut self, extra: &str) -> Vec<u8> {
        let offset = self.data.len();
        self.data.extend_from_slice(b"xref\n");
        for (number, position, generation) in &self.entries {
            self.data.extend_from_slice(
                format!("{number} 1\n{position:010} {generation:05} n\n").as_bytes(),
            );
        }
        self.data.extend_from_slice(
            format!("{extra}trailer\n<< /Size 100 /Root 1 0 R >>\nstartxref\n{offset}\n%%EOF\n")
                .as_bytes(),
        );
        self.data
    }
}
