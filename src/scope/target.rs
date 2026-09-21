use url::{Host, Url};

#[derive(Debug)]
pub(super) struct Target {
    host: String,
    port: TargetPort,
    wildcard: bool,
}

#[derive(Debug)]
enum TargetPort {
    Any,
    Exact(u16),
}

impl Target {
    pub(super) fn parse(value: &str) -> Option<Self> {
        let text = value.trim();
        if text
            .chars()
            .any(|ch| ch.is_whitespace() || ch == char::from(92))
        {
            return None;
        }
        let (wildcard, text) = match text.strip_prefix("*.") {
            Some(rest) => (true, rest),
            None => (false, text),
        };
        let url = parse_target_url(text)?;
        let host = target_host(&url, wildcard)?;
        let port = explicit_port(text)?;
        Some(Self {
            host,
            port,
            wildcard,
        })
    }

    pub(super) fn matches(&self, url: &Url) -> bool {
        let Some(host) = url.host_str() else {
            return false;
        };
        self.matches_host(host)
            && match self.port {
                TargetPort::Any => true,
                TargetPort::Exact(port) => Some(port) == url.port_or_known_default(),
            }
    }

    pub(super) fn matches_bare_host(&self, host: &str) -> bool {
        if !matches!(self.port, TargetPort::Any) {
            return false;
        }
        let target_host = self.host.strip_suffix('.').unwrap_or(&self.host);
        if !self.wildcard {
            return host == target_host;
        }
        host.strip_suffix(target_host)
            .is_some_and(|prefix| prefix.len() > 1 && prefix.ends_with('.'))
    }

    fn matches_host(&self, host: &str) -> bool {
        if !self.wildcard {
            return host == self.host;
        }
        host.strip_suffix(&self.host)
            .is_some_and(|prefix| prefix.len() > 1 && prefix.ends_with('.'))
    }
}

fn target_host(url: &Url, wildcard: bool) -> Option<String> {
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    if wildcard && !matches!(url.host(), Some(Host::Domain(_))) {
        return None;
    }
    Some(url.host_str()?.to_owned())
}

fn parse_target_url(text: &str) -> Option<Url> {
    if text.contains("://") {
        Url::parse(text).ok()
    } else {
        if text.contains(['/', '?', '#']) {
            return None;
        }
        Url::parse(&format!("http://{text}")).ok()
    }
}

fn explicit_port(text: &str) -> Option<TargetPort> {
    let authority = text
        .split_once("://")
        .map_or(text, |(_, rest)| rest)
        .split(['/', '?', '#'])
        .next()?;
    let suffix = if let Some(ipv6) = authority.strip_prefix('[') {
        ipv6.split_once(']')?.1
    } else {
        authority
            .find(':')
            .and_then(|index| authority.get(index..))
            .unwrap_or("")
    };
    if suffix.is_empty() {
        return Some(TargetPort::Any);
    }
    let port = suffix.strip_prefix(':')?;
    if !port.bytes().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    Some(TargetPort::Exact(port.parse().ok()?))
}

#[cfg(test)]
#[path = "target_tests.rs"]
mod tests;
