//! ページツリーの構造・参照解決の失敗。

use crate::object::{object_id::ObjectId, object_kind::ObjectKind};
use crate::resolver::error::ResolveError;

/// 構造検証する辞書キー。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageTreeKey {
    /// ノード種別。
    Type,
    /// 子参照の配列。
    Kids,
    /// 葉ページ数。
    Count,
}

impl PageTreeKey {
    pub(crate) fn as_bytes(self) -> &'static [u8] {
        match self {
            Self::Type => b"Type",
            Self::Kids => b"Kids",
            Self::Count => b"Count",
        }
    }
}

/// 部分的なページ列を成功として返さない致命的エラー。
#[derive(Debug, PartialEq)]
pub enum PageTreeError {
    /// ノードまたは辞書エントリの参照解決に失敗した。
    Resolution {
        /// 解決対象を持つノード。
        node: ObjectId,
        /// エントリのキー。ノード自身の解決では None。
        key: Option<PageTreeKey>,
        /// 解決層の原因。
        cause: ResolveError,
    },
    /// 解決されたノードが辞書でない。
    NotADictionary {
        /// 対象ノード。
        node: ObjectId,
        /// 実際の種別。
        actual: ObjectKind,
    },
    /// Type または Kids の値が不正な型。
    InvalidKeyType {
        /// 対象ノード。
        node: ObjectId,
        /// 対象キー。
        key: PageTreeKey,
        /// 実際の種別。
        actual: ObjectKind,
    },
    /// Type が Page / Pages 以外の名前。
    InvalidType {
        /// 対象ノード。
        node: ObjectId,
    },
    /// Type がなく、Kids・Parent のどちらにも推定根拠がない。
    CannotInferType {
        /// 対象ノード。
        node: ObjectId,
    },
    /// カタログの Pages 参照先が葉ページだった。
    RootIsPage {
        /// ルートの参照先。
        node: ObjectId,
    },
    /// Pages の Kids が欠落または null。
    MissingKids {
        /// 対象ノード。
        node: ObjectId,
    },
    /// Kids に子の間接参照以外が含まれる。
    InvalidKid {
        /// Kids を持つノード。
        node: ObjectId,
        /// Kids 内の 0 起点の位置。
        index: usize,
        /// 実際の要素種別。
        actual: ObjectKind,
    },
    /// 走査中の祖先を再訪したページツリーの循環。
    Cycle {
        /// 再訪した祖先のオブジェクト番号・世代番号。
        node: ObjectId,
    },
    /// 走査済みのノードを再訪した。同じ親の重複参照も、複数の親による共有も拒否する。
    RepeatedNode {
        /// 再訪したノード。
        node: ObjectId,
    },
}
