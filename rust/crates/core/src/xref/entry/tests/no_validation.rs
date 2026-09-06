use super::super::*;
use crate::object::free_object_number::FreeObjectNumber;

// ファイルサイズを超えうる巨大なオフセットも無検証で保持することを確認する。
// オフセットが実在の位置を指すかの検証は解析・解決層の責務であり、この型は判断しない。
#[test]
fn in_use_accepts_offset_beyond_plausible_file_size() {
    let entry = XRefEntry::InUse {
        offset: ByteOffset::new(u64::MAX),
        generation: GenerationNumber::new(0),
    };

    let XRefEntry::InUse { offset, .. } = entry else {
        panic!("InUse バリアントであるべき");
    };

    assert_eq!(offset.value(), u64::MAX);
}

// 65535 は仕様上フリーリスト先頭の予約世代だが、in-use エントリでも構築できることを確認する。
// 予約値の意味づけは xref を読む側の責務で、型としては禁じない。
#[test]
fn in_use_accepts_generation_reserved_for_free_list_head() {
    let entry = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(65535),
    };

    let XRefEntry::InUse { generation, .. } = entry else {
        panic!("InUse バリアントであるべき");
    };

    assert_eq!(generation.value(), 65535);
}

// 親 ObjStm の /N（格納オブジェクト数）を超えるインデックスも無検証で保持することを確認する。
// 範囲の検証は親ストリームを展開する層の責務。
#[test]
fn in_object_stream_accepts_index_beyond_plausible_object_count() {
    let entry = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(5).expect("positive object number"),
        index_in_stream: u32::MAX,
    };

    let XRefEntry::InObjectStream {
        index_in_stream, ..
    } = entry
    else {
        panic!("InObjectStream バリアントであるべき");
    };

    assert_eq!(index_in_stream, u32::MAX);
}

// 壊れたフリーリスト（実在しない番号を次の空き番号として指す）も構築できることを確認する。
// 鎖の整合性検証はこの型の責務ではない。
#[test]
fn free_accepts_next_free_object_pointing_to_arbitrary_number() {
    let entry = XRefEntry::Free {
        next_free_object: FreeObjectNumber::new(u64::MAX),
        generation: GenerationNumber::new(0),
    };

    let XRefEntry::Free {
        next_free_object, ..
    } = entry
    else {
        panic!("Free バリアントであるべき");
    };

    assert_eq!(next_free_object.value(), u64::MAX);
}
