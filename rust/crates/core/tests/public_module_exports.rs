use pdfmod_core::error::{PdfError, PdfErrorCode};
use pdfmod_core::object::{
    FreeObjectNumber, GenerationNumber, IndirectObject, IndirectRef, ObjectId, ObjectKind,
    ObjectNumber, PdfArray, PdfBoolean, PdfDictionary, PdfInteger, PdfName, PdfObject, PdfReal,
    PdfStream, PdfString, StringEncoding,
};

macro_rules! assert_same_type {
    ($short:ty, $deep:ty) => {
        let _: Option<$short> = None::<$deep>;
    };
}

#[test]
fn object_reexports_are_the_original_public_types() {
    assert_same_type!(PdfArray, pdfmod_core::object::array::PdfArray);
    assert_same_type!(PdfBoolean, pdfmod_core::object::boolean::PdfBoolean);
    assert_same_type!(
        PdfDictionary,
        pdfmod_core::object::dictionary::PdfDictionary
    );
    assert_same_type!(
        FreeObjectNumber,
        pdfmod_core::object::free_object_number::FreeObjectNumber
    );
    assert_same_type!(
        GenerationNumber,
        pdfmod_core::object::generation_number::GenerationNumber
    );
    assert_same_type!(
        IndirectObject,
        pdfmod_core::object::indirect_object::IndirectObject
    );
    assert_same_type!(IndirectRef, pdfmod_core::object::indirect_ref::IndirectRef);
    assert_same_type!(PdfInteger, pdfmod_core::object::integer::PdfInteger);
    assert_same_type!(PdfName, pdfmod_core::object::name::PdfName);
    assert_same_type!(ObjectId, pdfmod_core::object::object_id::ObjectId);
    assert_same_type!(ObjectKind, pdfmod_core::object::object_kind::ObjectKind);
    assert_same_type!(
        ObjectNumber,
        pdfmod_core::object::object_number::ObjectNumber
    );
    assert_same_type!(PdfObject, pdfmod_core::object::pdf_object::PdfObject);
    assert_same_type!(PdfReal, pdfmod_core::object::real::PdfReal);
    assert_same_type!(PdfStream, pdfmod_core::object::stream::PdfStream);
    assert_same_type!(PdfString, pdfmod_core::object::string::PdfString);
    assert_same_type!(StringEncoding, pdfmod_core::object::string::StringEncoding);
}

#[test]
fn error_reexports_are_the_original_public_types() {
    assert_same_type!(PdfError, pdfmod_core::error::pdf_error::PdfError);
    assert_same_type!(
        PdfErrorCode,
        pdfmod_core::error::pdf_error_code::PdfErrorCode
    );
}
