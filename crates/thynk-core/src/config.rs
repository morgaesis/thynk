use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub port: u16,
}

impl Default for Config {
    fn default() -> Self {
        let data_dir = std::env::var("THYNK_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./data"));
        let db_path = data_dir.join(".thynk").join("index.db");
        let port = std::env::var("THYNK_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);
        Self {
            data_dir,
            db_path,
            port,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.port, 3000);
    }

    #[test]
    fn test_db_path_in_thynk_subdir() {
        let config = Config::default();
        assert!(config.db_path.to_string_lossy().contains(".thynk"));
    }
}
