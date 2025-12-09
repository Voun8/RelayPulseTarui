use reqwest::Client;
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_autostart::MacosLauncher;

struct AppState {
    interval: Mutex<u64>,
}

#[tauri::command]
async fn fetch_status() -> Result<Value, String> {
    let url = "https://relaypulse.top/api/status?period=24h";
    let client = Client::new();

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let json: Value = serde_json::from_str(&resp).map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn set_interval(state: State<AppState>, ms: u64) {
    *state.interval.lock().unwrap() = ms;
}

#[tauri::command]
fn get_interval(state: State<AppState>) -> u64 {
    *state.interval.lock().unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState {
            interval: Mutex::new(5000),
        })
        .invoke_handler(tauri::generate_handler![
            fetch_status,
            set_interval,
            get_interval
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
