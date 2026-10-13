//! 明示スタックによるページツリー走査。Count は枝刈りに使わない。

mod node;

use std::collections::HashSet;

use super::ObjectResolver;
use crate::catalog::Catalog;
use crate::object::{indirect_ref::IndirectRef, object_id::ObjectId};
use crate::page_tree::{
    error::PageTreeError,
    warning::{PageNodeKind, PageTreeWarning},
    Page, PageTree,
};
use node::PageNode;

enum Visit {
    Enter(IndirectRef),
    Leave {
        node: ObjectId,
        start: usize,
        declared: Option<u64>,
    },
}

#[derive(Default)]
struct Walk {
    pages: Vec<Page>,
    warnings: Vec<PageTreeWarning>,
    ancestors: HashSet<ObjectId>,
    visited: HashSet<ObjectId>,
    stack: Vec<Visit>,
}

impl Walk {
    fn run(
        mut self,
        root: IndirectRef,
        resolver: &mut ObjectResolver<'_>,
    ) -> Result<PageTree, PageTreeError> {
        self.stack.push(Visit::Enter(root));
        while let Some(visit) = self.stack.pop() {
            match visit {
                Visit::Enter(reference) => self.enter(reference, root, resolver)?,
                Visit::Leave {
                    node,
                    start,
                    declared,
                } => self.leave(node, start, declared),
            }
        }
        Ok(PageTree::new(self.pages, self.warnings))
    }

    fn enter(
        &mut self,
        reference: IndirectRef,
        root: IndirectRef,
        resolver: &mut ObjectResolver<'_>,
    ) -> Result<(), PageTreeError> {
        let node = reference.target();
        if self.ancestors.contains(&node) {
            return Err(PageTreeError::Cycle { node });
        }
        if !self.visited.insert(node) {
            return Err(PageTreeError::RepeatedNode { node });
        }

        let object = resolver
            .resolve(reference)
            .map_err(|cause| PageTreeError::Resolution {
                node,
                key: None,
                cause,
            })?;
        let parsed = PageNode::new(node, &object)?;
        let kind = parsed.kind(resolver, &mut self.warnings)?;
        match kind {
            PageNodeKind::Page => {
                if reference == root {
                    return Err(PageTreeError::RootIsPage { node });
                }
                self.pages.push(Page::new(reference, root, object));
            }
            PageNodeKind::Pages => {
                let kids = parsed.kids(resolver)?;
                let declared = parsed.count(resolver, &mut self.warnings)?;
                self.ancestors.insert(node);
                self.stack.push(Visit::Leave {
                    node,
                    start: self.pages.len(),
                    declared,
                });
                // LIFO なので逆順で積み、Kids の先頭から深さ優先で取り出す。
                self.stack.extend(kids.into_iter().rev().map(Visit::Enter));
            }
        }
        Ok(())
    }

    fn leave(&mut self, node: ObjectId, start: usize, declared: Option<u64>) {
        self.ancestors.remove(&node);
        let Some(declared) = declared else {
            return;
        };
        let actual = self.pages.len().saturating_sub(start);
        if u64::try_from(actual).ok() != Some(declared) {
            self.warnings.push(PageTreeWarning::CountMismatch {
                node,
                declared,
                actual,
            });
        }
    }
}

impl ObjectResolver<'_> {
    /// カタログの Pages を明示スタックで走査し、文書順の葉ページと警告を返す。
    /// 祖先への再訪は Cycle、共有・重複ノードは RepeatedNode とし、対象IDを返す。
    /// 不正な構造・参照解決失敗もエラー。木の深さ上限は設けず、属性の継承は行わない。
    ///
    /// ```
    /// use pdfmod_core::{catalog::Catalog, resolver::ObjectResolver};
    /// use pdfmod_core::page_tree::{error::PageTreeError, index::{PageIndex, PageNumber}};
    /// # fn example(resolver: &mut ObjectResolver<'_>, catalog: &Catalog) -> Result<(), PageTreeError> {
    /// let tree = resolver.page_tree(catalog)?;
    /// let first_page = tree.page(PageIndex::from(0));
    /// if let Some(number) = PageNumber::new(1) {
    ///     assert_eq!(first_page.map(|page| page.reference()),
    ///                tree.page(number.into()).map(|page| page.reference()));
    /// }
    /// assert!(tree.page(PageIndex::from(usize::MAX)).is_none());
    /// # Ok(())
    /// # }
    /// ```
    pub fn page_tree(&mut self, catalog: &Catalog) -> Result<PageTree, PageTreeError> {
        Walk::default().run(catalog.pages(), self)
    }
}
