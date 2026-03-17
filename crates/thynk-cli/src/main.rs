use std::env;
use std::path::PathBuf;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "thynk")]
#[command(about = "Thynk CLI - Knowledge base management", long_about = None)]
struct Cli {
    #[arg(short, long, default_value = "./data")]
    data_dir: PathBuf,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all notes
    List,
    /// Search notes
    Search { query: String },
    /// Show note content
    Cat { path: String },
    /// Create a new note
    Create {
        path: String,
        content: Option<String>,
    },
    /// Delete a note
    Delete { path: String },
}

fn get_data_dir() -> PathBuf {
    env::var("THYNK_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data"))
}

fn main() {
    let cli = Cli::parse();
    let data_dir = if cli.data_dir.as_os_str() == "./data" {
        get_data_dir()
    } else {
        cli.data_dir
    };

    match cli.command {
        Commands::List => {
            use thynk_cli::list_notes;
            match list_notes(&data_dir) {
                Ok(notes) => {
                    if notes.is_empty() {
                        println!("No notes found.");
                    } else {
                        for note in notes {
                            println!("{}", note.display());
                        }
                    }
                }
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Commands::Search { query } => {
            use thynk_cli::search_notes;
            match search_notes(&data_dir, &query) {
                Ok(results) => {
                    if results.is_empty() {
                        println!("No results found.");
                    } else {
                        for r in results {
                            println!("{} - {}", r.title, r.path.display());
                            println!("  {}\n", r.snippet);
                        }
                    }
                }
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Commands::Cat { path } => {
            use thynk_cli::read_note;
            match read_note(&data_dir, &path) {
                Ok(content) => println!("{}", content),
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Commands::Create { path, content } => {
            use thynk_cli::create_note;
            let content = content.unwrap_or_default();
            match create_note(&data_dir, &path, &content) {
                Ok(()) => println!("Note created: {}", path),
                Err(e) => eprintln!("Error: {}", e),
            }
        }
        Commands::Delete { path } => {
            use thynk_cli::delete_note;
            match delete_note(&data_dir, &path) {
                Ok(()) => println!("Note deleted: {}", path),
                Err(e) => eprintln!("Error: {}", e),
            }
        }
    }
}
