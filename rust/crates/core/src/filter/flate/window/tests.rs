use super::*;

mod copy_match;
mod distance;
mod length;

// バイト列から埋まった状態のウィンドウを作る。
fn window_of(bytes: &[u8]) -> Window {
    let mut window = Window::new();
    window.extend_from_slice(bytes);
    window
}
