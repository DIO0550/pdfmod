use super::*;

#[test]
fn reads_single_stream_only_when_requested_and_shares_cached_object() {
    let mut pdf = PdfFixture::one_page("/Contents 4 0 R");
    pdf.object("<< /Length 1 >>\nstream\nq\nendstream");
    let data = pdf.finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    let page = document.page(0.into()).unwrap().unwrap();
    assert_eq!(page.contents().unwrap().kind(), ObjectKind::Reference);
    let streams = document.content_streams(&page).unwrap();
    assert_eq!(streams.len(), 1);
    assert_eq!(streams[0].as_stream().unwrap().data(), b"q");
    let again = document.content_streams(&page).unwrap();
    assert!(Rc::ptr_eq(&streams[0], &again[0]));
}

#[test]
fn reads_direct_or_indirect_arrays_in_order_without_concatenating() {
    for contents in ["[4 0 R 5 0 R]", "6 0 R"] {
        let mut pdf = PdfFixture::one_page(&format!("/Contents {contents}"));
        pdf.object("<< /Length 1 >>\nstream\nq\nendstream");
        pdf.object("<< /Length 1 >>\nstream\nQ\nendstream");
        pdf.object("[4 0 R 5 0 R]");
        let data = pdf.finish("");
        let mut document = PdfDocument::open(&data).unwrap();
        let page = document.page(0.into()).unwrap().unwrap();
        let streams = document.content_streams(&page).unwrap();
        let bytes: Vec<_> = streams
            .iter()
            .map(|object| object.as_stream().unwrap().data())
            .collect();
        assert_eq!(bytes, vec![b"q".as_slice(), b"Q".as_slice()]);
    }
}

#[test]
fn absent_null_and_empty_contents_produce_no_streams() {
    for contents in ["", "/Contents null", "/Contents []", "/Contents 4 0 R"] {
        let mut pdf = PdfFixture::one_page(contents);
        pdf.object("null");
        let data = pdf.finish("");
        let mut document = PdfDocument::open(&data).unwrap();
        let page = document.page(0.into()).unwrap().unwrap();
        assert!(document.content_streams(&page).unwrap().is_empty());
    }
}

#[test]
fn leaves_filtered_streams_encoded() {
    let mut pdf = PdfFixture::one_page("/Contents 4 0 R");
    // 意図的にzlibとして不正なデータを使い、この層で展開していないことを確認する。
    pdf.object("<< /Length 3 /Filter /FlateDecode >>\nstream\nabc\nendstream");
    let data = pdf.finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    let page = document.page(0.into()).unwrap().unwrap();
    let streams = document.content_streams(&page).unwrap();
    let stream = streams[0].as_stream().unwrap();
    assert_eq!(stream.data(), b"abc");
    assert!(stream.dictionary().get(b"Filter".as_slice()).is_some());
}

#[test]
fn reports_invalid_contents_and_array_element_positions() {
    for (contents, index, actual) in [
        ("/Contents 42", None, ObjectKind::Integer),
        ("/Contents [4 0 R null]", Some(1), ObjectKind::Null),
        ("/Contents [4 0 R [5 0 R]]", Some(1), ObjectKind::Array),
        ("/Contents [99 0 R]", Some(0), ObjectKind::Null),
    ] {
        let mut pdf = PdfFixture::one_page(contents);
        pdf.object("<< /Length 1 >>\nstream\nq\nendstream");
        let data = pdf.finish("");
        let mut document = PdfDocument::open(&data).unwrap();
        let page = document.page(0.into()).unwrap().unwrap();
        assert_eq!(
            document.content_streams(&page).unwrap_err(),
            DocumentError::InvalidContents {
                page: page.reference().target(),
                index,
                actual,
            }
        );
    }
}
