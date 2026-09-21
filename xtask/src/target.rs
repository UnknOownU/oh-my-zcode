use clap::ValueEnum;

#[derive(Clone, Copy, Debug, ValueEnum)]
pub(crate) enum Target {
    #[value(name = "x86_64-pc-windows-msvc")]
    WindowsX64,
    #[value(name = "x86_64-apple-darwin")]
    MacosX64,
    #[value(name = "aarch64-apple-darwin")]
    MacosArm64,
    #[value(name = "x86_64-unknown-linux-musl")]
    LinuxX64,
    #[value(name = "aarch64-unknown-linux-musl")]
    LinuxArm64,
}

impl Target {
    pub(crate) const fn triple(self) -> &'static str {
        match self {
            Self::WindowsX64 => "x86_64-pc-windows-msvc",
            Self::MacosX64 => "x86_64-apple-darwin",
            Self::MacosArm64 => "aarch64-apple-darwin",
            Self::LinuxX64 => "x86_64-unknown-linux-musl",
            Self::LinuxArm64 => "aarch64-unknown-linux-musl",
        }
    }

    pub(crate) const fn executable(self) -> &'static str {
        match self {
            Self::WindowsX64 => "oh-my-zcode.exe",
            Self::MacosX64 | Self::MacosArm64 | Self::LinuxX64 | Self::LinuxArm64 => "oh-my-zcode",
        }
    }

    pub(crate) fn command(self) -> String {
        format!("${{ZCODE_PLUGIN_ROOT}}/bin/{}", self.executable())
    }
}
