mod derivation;
mod selection;

use super::{EncryptedValueKind, ObjectDecryptionTarget};
use crate::object::{
    generation_number::GenerationNumber, object_id::ObjectId, object_number::ObjectNumber,
};

fn indirect(number: u64, generation: u16, kind: EncryptedValueKind) -> ObjectDecryptionTarget {
    let number = ObjectNumber::new(number).expect("間接オブジェクト番号は正の整数");
    let id = ObjectId::new(number, GenerationNumber::new(generation));
    ObjectDecryptionTarget::Indirect { id, kind }
}
