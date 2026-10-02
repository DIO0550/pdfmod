use super::*;
use crate::object::{generation_number::GenerationNumber, object_number::ObjectNumber};
fn id(n: u64, g: u16) -> ObjectId {
    ObjectId::new(ObjectNumber::new(n).unwrap(), GenerationNumber::new(g))
}

#[test]
fn generations_replacement_and_eviction_order() {
    let mut cache = ObjectCache::new(2);
    let a = Rc::new(PdfObject::from(1));
    let b = Rc::new(PdfObject::from(2));
    cache.insert(id(1, 0), Rc::clone(&a));
    cache.insert(id(1, 1), Rc::clone(&b));
    assert!(Rc::ptr_eq(&cache.get(id(1, 0)).unwrap(), &a));
    cache.insert(id(2, 0), Rc::new(PdfObject::from(3)));
    assert!(cache.get(id(1, 1)).is_none());
    assert!(Rc::ptr_eq(&cache.get(id(1, 0)).unwrap(), &a));
    cache.insert(id(1, 0), Rc::clone(&b));
    assert!(Rc::ptr_eq(&cache.get(id(1, 0)).unwrap(), &b));
    assert_eq!(cache.entries.len(), 2);
}

#[test]
fn linked_order_matches_reference_lru_under_repeated_touches() {
    for capacity in 0..=5 {
        let mut cache = ObjectCache::new(capacity);
        let mut order = Vec::new();
        for step in 0..400u64 {
            let key = id((step * 17 / 7) % 11 + 1, 0);
            let previous = order.iter().position(|seen| *seen == key);
            if step % 3 == 0 {
                assert_eq!(cache.get(key).is_some(), previous.is_some());
                if let Some(index) = previous {
                    let _ = order.remove(index);
                    order.push(key);
                }
            } else if capacity > 0 {
                if let Some(index) = previous {
                    let _ = order.remove(index);
                }
                if order.len() == capacity {
                    let _ = order.remove(0);
                }
                order.push(key);
                cache.insert(key, Rc::new(PdfObject::Null));
            } else {
                cache.insert(key, Rc::new(PdfObject::Null));
            }
            assert_eq!(cache.entries.len(), order.len());
            let mut cursor = cache.oldest;
            for expected in &order {
                assert_eq!(cursor, Some(*expected));
                cursor = cache.entries.get(expected).unwrap().next;
            }
            assert_eq!(cursor, None);
            assert_eq!(cache.newest, order.last().copied());
        }
    }
}
