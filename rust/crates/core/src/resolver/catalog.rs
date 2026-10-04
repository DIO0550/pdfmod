//! トレイラの Root からカタログを遅延取得する。

use super::ObjectResolver;
use crate::catalog::{
    error::{CatalogError, CatalogErrorKind},
    Catalog,
};

impl ObjectResolver<'_> {
    /// Root を解決し、カタログを検証する。子の参照先は読み込まない。
    /// 解決・構造エラーは参照元トレイラの位置付きで返す。
    /// トレイラを持たない `new` 由来の resolver ではヘッダ位置付きの MissingTrailer。
    pub fn catalog(&mut self) -> Result<Catalog, CatalogError> {
        let trailer = self.trailer.as_ref().ok_or_else(|| {
            CatalogError::new(CatalogErrorKind::MissingTrailer, self.header.origin())
        })?;
        let root = trailer.root();
        let position = trailer.position();
        let object = self.resolve(root).map_err(|error| {
            CatalogError::new(CatalogErrorKind::RootResolutionFailed(error), position)
        })?;
        Catalog::from_object(object, self.header.version(), position)
    }
}
