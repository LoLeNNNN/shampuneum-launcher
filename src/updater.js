class LauncherUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.currentVersion = app.getVersion();
    
    this.config = {
      githubRepo: 'LOLENNNN/shampuneum-launcher', 
      checkInterval: 30 * 60 * 1000,
      autoCheck: true,
      preferPortable: true
    };
  }

  async checkGitHubUpdates() {
    return new Promise((resolve, reject) => {
      const url = `https://api.github.com/repos/${this.config.githubRepo}/releases/latest`;
      
      https.get(url, {
        headers: { 
          'User-Agent': 'Shampuneum-Launcher',
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (response) => {
        let data = '';
        
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            const release = JSON.parse(data);
            
            if (release.draft || release.prerelease) {
              resolve({ available: false });
              return;
            }
            
            const latestVersion = release.tag_name.replace(/^v/, '');
            
            if (this.compareVersions(latestVersion, this.currentVersion) > 0) {
              let asset = null;
              
              if (this.config.preferPortable) {
                asset = release.assets.find(a => 
                  a.name.toLowerCase().includes('portable') && 
                  a.name.toLowerCase().includes('exe')
                );
              }
              
              if (!asset) {
                asset = release.assets.find(a => 
                  (a.name.toLowerCase().includes('win') || 
                   a.name.endsWith('.exe') || 
                   a.name.endsWith('.zip')) &&
                  !a.name.includes('blockmap') &&
                  !a.name.includes('latest.yml')
                );
              }
              
              if (!asset) {
                reject(new Error('Подходящий файл обновления не найден'));
                return;
              }
              
              resolve({
                available: true,
                version: latestVersion,
                downloadUrl: asset.browser_download_url,
                changelog: this.parseChangelog(release.body || ''),
                size: this.formatBytes(asset.size),
                fileName: asset.name,
                publishDate: new Date(release.published_at).toLocaleDateString('ru-RU'),
                isPortable: asset.name.toLowerCase().includes('portable')
              });
            } else {
              resolve({ available: false });
            }
          } catch (error) {
            reject(new Error(`Ошибка парсинга ответа GitHub: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Ошибка сети при проверке обновлений: ${error.message}`));
      });
    });
  }

  parseChangelog(markdown) {
    if (!markdown) return 'Информация об изменениях недоступна';
    
    return markdown
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim();
  }
}