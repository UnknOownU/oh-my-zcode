//! Native evidence and authorization gates for `ZCode`.
pub mod hook;
pub mod mcp;
pub mod proof;
pub mod scope;
pub mod validator;
pub mod workspace;

#[cfg(all(windows, feature = "native-windows-metadata-skip-miri"))]
pub mod windows_metadata;
#[cfg(all(windows, not(feature = "native-windows-metadata-skip-miri")))]
compile_error!("Windows artifact identity requires native-windows-metadata-skip-miri");
