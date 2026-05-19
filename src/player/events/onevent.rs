use std::env;

fn main() {
    let event = env::var("PLAYER_EVENT").unwrap_or_default();
    let port = env::var("SORTY_PORT").unwrap_or_else(|_| "7878".to_string());

    let body = format!("{{\"event\":\"{}\"}}", event);
    let url = format!("http://localhost:{}/api/librespot-event", port);

    let _ = ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_string(&body);
}