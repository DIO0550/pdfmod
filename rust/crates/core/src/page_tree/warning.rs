//! 不正な Type 欠落・Count を回復した走査警告。

use crate::object::{object_id::ObjectId, object_kind::ObjectKind};

/// ページツリーのノード種別。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageNodeKind {
    /// 子を持つ Pages ノード。
    Pages,
    /// 葉の Page ノード。
    Page,
}

/// ページ列を維持したまま呼び出し側へ報告する警告。
#[derive(Debug, PartialEq, Eq)]
pub enum PageTreeWarning {
    /// Type が欠落または null。Kids を優先し、無ければ Parent から推定した。
    InferredType {
        /// 推定対象のノード。
        node: ObjectId,
        /// 推定された種別。
        inferred: PageNodeKind,
    },
    /// Pages の Count が欠落または null。
    MissingCount {
        /// 対象ノード。
        node: ObjectId,
    },
    /// Count が整数でない、または負の整数。
    InvalidCount {
        /// 対象ノード。
        node: ObjectId,
        /// 実際の値の種別。Integer は負数を示す。
        actual: ObjectKind,
    },
    /// Pages 配下の葉数と宣言数が異なる。実際の葉数を正とする。
    CountMismatch {
        /// 対象ノード。
        node: ObjectId,
        /// PDF が宣言した非負の葉数。
        declared: u64,
        /// このノード配下を実走査した葉数。
        actual: usize,
    },
}
