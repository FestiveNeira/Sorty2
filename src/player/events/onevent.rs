use std::env;
use std::net::UdpSocket;

fn main() {
    let event = env::var("PLAYER_EVENT").unwrap_or_default();
    if event.is_empty() {
        return;
    }

    let port = env::var("SORTY_PORT").unwrap_or_else(|_| "7878".to_string());

    let body = format!("{{\"event\":\"{}\"}}", event);

    if let Ok(socket) = UdpSocket::bind("127.0.0.1:0") {
        let target_address = format!("127.0.0.1:{}", port);
        
        let _ = socket.send_to(body.as_bytes(), target_address);
    }
}