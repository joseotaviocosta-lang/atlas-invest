use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: native_storage_smoke <write|read|clear> [token]");
        std::process::exit(1);
    }

    match args[1].as_str() {
        "write" => {
            let token = args.get(2).expect("Token required for write command");
            atlas_app_lib::storage::set_refresh_token(token).expect("Failed to write token");
            println!("PERSISTED_OK: {}", token);
        }
        "read" => {
            let result = atlas_app_lib::storage::get_refresh_token().expect("Failed to read token");
            match result {
                Some(token) => println!("TOKEN: {}", token),
                None => println!("TOKEN: <EMPTY>"),
            }
        }
        "clear" => {
            atlas_app_lib::storage::clear_refresh_token().expect("Failed to clear token");
            println!("CLEARED_OK");
        }
        other => {
            eprintln!("Unknown action: {}", other);
            std::process::exit(1);
        }
    }
}
