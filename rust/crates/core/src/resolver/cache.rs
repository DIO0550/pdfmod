//! 件数で制限する O(1) LRU。オブジェクト内容は Rc で共有する。
use crate::object::{object_id::ObjectId, pdf_object::PdfObject};
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Debug)]
struct Entry {
    value: Rc<PdfObject>,
    previous: Option<ObjectId>,
    next: Option<ObjectId>,
}

/// oldest/newest と各エントリの双方向リンクは常に同じ順序を表す。
#[derive(Debug)]
pub(super) struct ObjectCache {
    capacity: usize,
    entries: HashMap<ObjectId, Entry>,
    oldest: Option<ObjectId>,
    newest: Option<ObjectId>,
}

impl ObjectCache {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            capacity,
            entries: HashMap::new(),
            oldest: None,
            newest: None,
        }
    }

    pub(super) fn get(&mut self, id: ObjectId) -> Option<Rc<PdfObject>> {
        let entry = self.remove(id)?;
        let value = Rc::clone(&entry.value);
        self.append(id, entry.value);
        Some(value)
    }

    pub(super) fn insert(&mut self, id: ObjectId, value: Rc<PdfObject>) {
        if self.capacity == 0 {
            return;
        }
        self.remove(id);
        if self.entries.len() >= self.capacity {
            if let Some(oldest) = self.oldest {
                self.remove(oldest);
            }
        }
        self.append(id, value);
    }

    fn remove(&mut self, id: ObjectId) -> Option<Entry> {
        let entry = self.entries.remove(&id)?;
        match entry.previous {
            Some(previous) => {
                if let Some(node) = self.entries.get_mut(&previous) {
                    node.next = entry.next;
                }
            }
            None => self.oldest = entry.next,
        }
        match entry.next {
            Some(next) => {
                if let Some(node) = self.entries.get_mut(&next) {
                    node.previous = entry.previous;
                }
            }
            None => self.newest = entry.previous,
        }
        Some(entry)
    }

    fn append(&mut self, id: ObjectId, value: Rc<PdfObject>) {
        let entry = Entry {
            value,
            previous: self.newest,
            next: None,
        };
        match self.newest {
            Some(previous) => {
                if let Some(node) = self.entries.get_mut(&previous) {
                    node.next = Some(id);
                }
            }
            None => self.oldest = Some(id),
        }
        self.entries.insert(id, entry);
        self.newest = Some(id);
    }
}

#[cfg(test)]
mod tests;
