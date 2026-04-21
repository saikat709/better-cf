export type Language =
  | 'c'
  | 'cpp'
  | 'java'
  | 'kotlin'
  | 'python'
  | 'pypy'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'go'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'scala'
  | 'haskell'
  | 'ocaml'
  | 'd'
  | 'lua';

export type SiteEntry = {
  id: string;
  host: string;
  enabled: boolean;
};

export type Settings = {
  version: 1;
  defaultLanguage: Language;
  templates: Record<Language, string>;
  sites: SiteEntry[];
};

export const LANGUAGE_META: Record<Language, { label: string; ext: string }> = {
  c: { label: 'C', ext: 'c' },
  cpp: { label: 'C++', ext: 'cpp' },
  java: { label: 'Java', ext: 'java' },
  kotlin: { label: 'Kotlin', ext: 'kt' },
  javascript: { label: 'JavaScript', ext: 'js' },
  typescript: { label: 'TypeScript', ext: 'ts' },
  python: { label: 'Python', ext: 'py' },
  pypy: { label: 'PyPy', ext: 'py' },
  rust: { label: 'Rust', ext: 'rs' },
  go: { label: 'Go', ext: 'go' },
  csharp: { label: 'C#', ext: 'cs' },
  ruby: { label: 'Ruby', ext: 'rb' },
  php: { label: 'PHP', ext: 'php' },
  swift: { label: 'Swift', ext: 'swift' },
  scala: { label: 'Scala', ext: 'scala' },
  haskell: { label: 'Haskell', ext: 'hs' },
  ocaml: { label: 'OCaml', ext: 'ml' },
  d: { label: 'D', ext: 'd' },
  lua: { label: 'Lua', ext: 'lua' },
};

export const DEFAULT_SNIPPETS: Record<Language, string> = {
  c: `#include <stdio.h>

int main() {
    int t;
    scanf("%d", &t);
    while (t--) {
        int n;
        scanf("%d", &n);
        printf("%d\\n", n);
    }
    return 0;
}
`,

  cpp: `#include <bits/stdc++.h>
using namespace std;

#define fast ios::sync_with_stdio(false); cin.tie(NULL);

int main() {
    fast;
    int t;
    cin >> t;
    while (t--) {
        int n;
        cin >> n;
        cout << n << '\\n';
    }
    return 0;
}
`,

  java: `import java.io.*;
import java.util.*;

public class Main {
    static FastScanner fs = new FastScanner(System.in);
    static PrintWriter out = new PrintWriter(System.out);

    public static void main(String[] args) {
        int t = fs.nextInt();
        while (t-- > 0) {
            int n = fs.nextInt();
            out.println(n);
        }
        out.flush();
    }

    static class FastScanner {
        BufferedReader br;
        StringTokenizer st;

        FastScanner(InputStream is) {
            br = new BufferedReader(new InputStreamReader(is));
        }

        String next() {
            while (st == null || !st.hasMoreElements()) {
                try {
                    st = new StringTokenizer(br.readLine());
                } catch (IOException e) {
                    return null;
                }
            }
            return st.nextToken();
        }

        int nextInt() {
            return Integer.parseInt(next());
        }
    }
}`,

  kotlin: `import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.StringTokenizer

fun main() {
    val br = BufferedReader(InputStreamReader(System.in))
    var st = StringTokenizer(br.readLine())
    val t = st.nextToken().toInt()

    repeat(t) {
        st = StringTokenizer(br.readLine())
        val n = st.nextToken().toInt()
        println(n)
    }
}
`,

  python: `import sys
input = sys.stdin.readline

t = int(input())
for _ in range(t):
    n = int(input())
    print(n)
`,

  pypy: `import sys
input = sys.stdin.readline

t = int(input())
for _ in range(t):
    n = int(input())
    print(n)
`,

  javascript: `const fs = require('fs');

const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/).map(Number);
let idx = 0;

let t = input[idx++];
while (t--) {
    let n = input[idx++];
    console.log(n);
}
`,

  typescript: `import * as fs from 'fs';

const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/).map(Number);
let idx = 0;

let t = input[idx++];
while (t--) {
    let n = input[idx++];
    console.log(n);
}
`,

  rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let mut iter = input.split_whitespace();

    let t: i32 = iter.next().unwrap().parse().unwrap();
    for _ in 0..t {
        let n: i32 = iter.next().unwrap().parse().unwrap();
        println!("{}", n);
    }
}
`,

  go: `package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    in := bufio.NewReader(os.Stdin)
    var t int
    fmt.Fscan(in, &t)

    for t > 0 {
        var n int
        fmt.Fscan(in, &n)
        fmt.Println(n)
        t--
    }
}
`,

  csharp: `using System;
using System.IO;

class Program {
    static void Main() {
        var input = Console.ReadLine();
        int t = int.Parse(input);
        while (t-- > 0) {
            int n = int.Parse(Console.ReadLine());
            Console.WriteLine(n);
        }
    }
}
`,

  ruby: `t = gets.to_i
t.times do
  n = gets.to_i
  puts n
end
`,

  php: `<?php
$t = intval(fgets(STDIN));
while ($t--) {
    $n = intval(fgets(STDIN));
    echo $n . PHP_EOL;
}
`,

  swift: `import Foundation

if let t = Int(readLine()!) {
    for _ in 0..<t {
        let n = Int(readLine()!)!
        print(n)
    }
}
`,

  scala: `import scala.io.StdIn._

object Main {
  def main(args: Array[String]): Unit = {
    val t = readInt()
    for (_ <- 0 until t) {
      val n = readInt()
      println(n)
    }
  }
}
`,

  haskell: `main = do
    t <- readLn :: IO Int
    sequence_ [do
        n <- readLn :: IO Int
        print n
        | _ <- [1..t]]
`,

  ocaml: `let t = read_int () in
for _ = 1 to t do
  let n = read_int () in
  print_int n;
  print_newline ();
done;
`,

  d: `import std.stdio;
import std.conv;

void main() {
    int t;
    readf("%d", &t);
    while (t--) {
        int n;
        readf("%d", &n);
        writeln(n);
    }
}
`,

  lua: `t = tonumber(io.read())
for i = 1, t do
    n = tonumber(io.read())
    print(n)
end
`,
};

export const DEFAULT_SITES: SiteEntry[] = [
  { id: 'cf', host: 'codeforces.com', enabled: true },
  { id: 'vjudge', host: 'vjudge.net', enabled: true },
  { id: 'atcoder', host: 'atcoder.jp', enabled: true },
  { id: 'codechef', host: 'codechef.com', enabled: true },
  { id: 'cses', host: 'cses.fi', enabled: true },
  { id: 'leetcode', host: 'leetcode.com', enabled: true },
  { id: 'hackerrank', host: 'hackerrank.com', enabled: false },
  { id: 'hackerearth', host: 'hackerearth.com', enabled: false },
];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  defaultLanguage: 'cpp',
  templates: { ...DEFAULT_SNIPPETS },
  sites: DEFAULT_SITES,
};

const SETTINGS_KEY = 'better-cp:settings';

type ExtensionApi = typeof globalThis & { browser?: unknown; chrome?: unknown };

const getExtensionApi = () => {
  const root = globalThis as ExtensionApi;
  const api = root.browser ?? root.chrome;
  return api ?? null;
};

type StorageApi = {
  local?: {
    get: (key: string) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
  };
  onChanged?: {
    addListener: (handler: () => void) => void;
    removeListener: (handler: () => void) => void;
  };
};

export const getStorageApi = (): StorageApi | null => {
  const api = getExtensionApi();
  if (!api || typeof api !== 'object') return null;
  const storage = (api as { storage?: StorageApi }).storage;
  return storage ?? null;
};

export const normalizeSiteInput = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return parsed.host.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '').split('/')[0];
  }
};

export const isSiteAllowed = (host: string, sites: SiteEntry[]): boolean => {
  const normalizedHost = host.toLowerCase();
  return sites.some((site) => {
    if (!site.enabled) return false;
    const normalizedSite = normalizeSiteInput(site.host);
    if (!normalizedSite) return false;
    if (normalizedSite.startsWith('*.')) {
      const suffix = normalizedSite.slice(1);
      return normalizedHost.endsWith(suffix);
    }
    return normalizedHost === normalizedSite || normalizedHost.endsWith(`.${normalizedSite}`);
  });
};

export const loadSettings = async (): Promise<Settings> => {
  const storage = getStorageApi()?.local;
  if (!storage) return DEFAULT_SETTINGS;
  const stored = (await storage.get(SETTINGS_KEY))[SETTINGS_KEY] as Settings | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    templates: { ...DEFAULT_SETTINGS.templates, ...stored.templates },
    sites: stored.sites?.length ? stored.sites : DEFAULT_SETTINGS.sites,
  };
};

export const saveSettings = async (next: Settings): Promise<void> => {
  const storage = getStorageApi()?.local;
  if (!storage) return;
  await storage.set({ [SETTINGS_KEY]: next });
};
