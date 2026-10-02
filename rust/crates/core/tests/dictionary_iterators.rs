//! PdfDictionary の公開イテレータ API を利用者側から検証する。

use pdfmod_core::object::{PdfDictionary, PdfName, PdfObject};

#[test]
fn iterators_support_exact_size_reverse_and_independent_clones() {
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("C"), PdfObject::from(1));
    dict.insert(PdfName::from("A"), PdfObject::from(3));
    dict.insert(PdfName::from("B"), PdfObject::from(2));

    let mut keys = dict.keys();
    assert_eq!(keys.len(), 3);
    assert_eq!(keys.next(), Some(&PdfName::from("A")));
    let cloned_keys = keys.clone();
    assert_eq!(keys.next_back(), Some(&PdfName::from("C")));
    assert_eq!(keys.len(), 1);
    assert_eq!(
        cloned_keys.rev().collect::<Vec<_>>(),
        vec![&PdfName::from("C"), &PdfName::from("B")]
    );

    let mut values = dict.values();
    assert_eq!(values.len(), 3);
    assert_eq!(values.next(), Some(&PdfObject::from(3)));
    let cloned_values = values.clone();
    assert_eq!(values.next_back(), Some(&PdfObject::from(1)));
    assert_eq!(values.len(), 1);
    assert_eq!(
        cloned_values.rev().collect::<Vec<_>>(),
        vec![&PdfObject::from(1), &PdfObject::from(2)]
    );

    let mut entries = dict.iter();
    assert_eq!(entries.len(), 3);
    assert_eq!(
        entries.next(),
        Some((&PdfName::from("A"), &PdfObject::from(3)))
    );
    let cloned_entries = entries.clone();
    assert_eq!(
        entries.next_back(),
        Some((&PdfName::from("C"), &PdfObject::from(1)))
    );
    assert_eq!(entries.len(), 1);
    assert_eq!(
        cloned_entries.rev().collect::<Vec<_>>(),
        vec![
            (&PdfName::from("C"), &PdfObject::from(1)),
            (&PdfName::from("B"), &PdfObject::from(2)),
        ]
    );
}

#[test]
fn borrowed_for_loop_visits_sorted_entries_without_consuming_dictionary() {
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("B"), PdfObject::from(2));
    dict.insert(PdfName::from("A"), PdfObject::from(1));
    let mut entries = Vec::new();
    for (key, value) in &dict {
        entries.push((key, value));
    }
    assert_eq!(
        entries,
        vec![
            (&PdfName::from("A"), &PdfObject::from(1)),
            (&PdfName::from("B"), &PdfObject::from(2)),
        ]
    );
    let iter = (&dict).into_iter();
    assert_eq!(iter.len(), 2);
    assert_eq!(
        iter.clone().rev().collect::<Vec<_>>(),
        vec![entries[1], entries[0]]
    );
    dict.insert(PdfName::from("C"), PdfObject::Null);
    assert_eq!(dict.len(), 3);
}

#[test]
fn collect_keeps_last_duplicate_value_and_preserves_null() {
    let dict: PdfDictionary = [
        (PdfName::from("B"), PdfObject::from(1)),
        (PdfName::from("A"), PdfObject::Null),
        (PdfName::from("B"), PdfObject::from(2)),
    ]
    .into_iter()
    .collect();
    assert_eq!(dict.len(), 2);
    assert_eq!(dict.get(b"A".as_slice()), Some(&PdfObject::Null));
    assert_eq!(dict.get(b"B".as_slice()), Some(&PdfObject::from(2)));
}

#[test]
fn extend_preserves_other_entries_and_overwrites_with_last_value() {
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("A"), PdfObject::from(1));
    dict.insert(PdfName::from("B"), PdfObject::from(2));
    dict.extend([
        (PdfName::from("B"), PdfObject::from(3)),
        (PdfName::from("C"), PdfObject::from(4)),
        (PdfName::from("B"), PdfObject::Null),
    ]);
    assert_eq!(dict.len(), 3);
    assert_eq!(dict.get(b"A".as_slice()), Some(&PdfObject::from(1)));
    assert_eq!(dict.get(b"B".as_slice()), Some(&PdfObject::Null));
    assert_eq!(dict.get(b"C".as_slice()), Some(&PdfObject::from(4)));
    dict.extend([]);
    assert_eq!(dict.len(), 3);
    assert_eq!(dict.get(b"B".as_slice()), Some(&PdfObject::Null));
}

#[test]
fn empty_input_produces_empty_dictionary_and_iterators() {
    let dict: PdfDictionary = std::iter::empty().collect();
    assert!(dict.is_empty());
    assert_eq!(dict.keys().len(), 0);
    assert_eq!(dict.keys().next_back(), None);
    assert_eq!(dict.values().len(), 0);
    assert_eq!(dict.values().next_back(), None);
    assert_eq!(dict.iter().len(), 0);
    assert_eq!(dict.iter().next_back(), None);
    assert_eq!((&dict).into_iter().len(), 0);
    assert_eq!((&dict).into_iter().next(), None);
}
