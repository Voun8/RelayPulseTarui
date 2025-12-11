use reqwest::Client;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // 创建托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘 - 使用应用默认图标
            let tray_icon = app.default_window_icon().cloned().unwrap();
            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .tooltip("RelayPulse Monitor")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
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
