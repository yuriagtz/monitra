/**
 * スクリーンショット比較機能のテストスクリプト
 * 
 * このスクリプトは以下をテストします:
 * 1. URLからスクリーンショットを撮影
 * 2. 同じURLを2回撮影して比較(差分がほぼ0%になることを確認)
 * 3. 異なるURLを撮影して比較(差分が検出されることを確認)
 */

import { captureScreenshot, compareScreenshots, checkLinkStatus } from './server/monitoring';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTests() {
  console.log('=== スクリーンショット比較機能のテスト開始 ===\n');

  const testDir = path.join(process.cwd(), 'test-output');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // テスト用URL (シンプルで安定したページ)
  const testUrl1 = 'https://example.com';
  const testUrl2 = 'https://www.google.com';

  try {
    // テスト1: リンク切れチェック
    console.log('【テスト1】リンク切れチェック');
    console.log(`URL: ${testUrl1}`);
    const linkStatus = await checkLinkStatus(testUrl1);
    console.log(`結果: ${linkStatus.ok ? '✓ OK' : '✗ エラー'}`);
    if (linkStatus.status) {
      console.log(`HTTPステータス: ${linkStatus.status}`);
    }
    if (linkStatus.error) {
      console.log(`エラー: ${linkStatus.error}`);
    }
    console.log('');

    // テスト2: スクリーンショット撮影
    console.log('【テスト2】スクリーンショット撮影');
    console.log(`URL: ${testUrl1}`);
    const screenshot1 = await captureScreenshot(testUrl1);
    const screenshot1Path = path.join(testDir, 'screenshot1.png');
    fs.writeFileSync(screenshot1Path, screenshot1);
    console.log(`✓ スクリーンショット保存: ${screenshot1Path}`);
    console.log(`サイズ: ${(screenshot1.length / 1024).toFixed(2)} KB`);
    console.log('');

    // テスト3: 同じURLを再度撮影(わずかな差分のみ)
    console.log('【テスト3】同じURLを再撮影して比較');
    console.log(`URL: ${testUrl1}`);
    const screenshot2 = await captureScreenshot(testUrl1);
    const screenshot2Path = path.join(testDir, 'screenshot2.png');
    fs.writeFileSync(screenshot2Path, screenshot2);
    console.log(`✓ スクリーンショット保存: ${screenshot2Path}`);
    
    const comparison1 = await compareScreenshots(screenshot1, screenshot2);
    console.log(`差分率: ${comparison1.diffPercentage.toFixed(4)}%`);
    
    if (comparison1.diffImageBuffer) {
      const diffPath1 = path.join(testDir, 'diff1.png');
      fs.writeFileSync(diffPath1, comparison1.diffImageBuffer);
      console.log(`差分画像保存: ${diffPath1}`);
    }
    
    if (comparison1.diffPercentage < 5) {
      console.log('✓ 同じページの差分が5%未満 (正常)');
    } else {
      console.log('✗ 同じページなのに差分が大きい (要確認)');
    }
    console.log('');

    // テスト4: 異なるURLを撮影して比較
    console.log('【テスト4】異なるURLを撮影して比較');
    console.log(`URL: ${testUrl2}`);
    const screenshot3 = await captureScreenshot(testUrl2);
    const screenshot3Path = path.join(testDir, 'screenshot3.png');
    fs.writeFileSync(screenshot3Path, screenshot3);
    console.log(`✓ スクリーンショット保存: ${screenshot3Path}`);
    
    const comparison2 = await compareScreenshots(screenshot1, screenshot3);
    console.log(`差分率: ${comparison2.diffPercentage.toFixed(4)}%`);
    
    if (comparison2.diffImageBuffer) {
      const diffPath2 = path.join(testDir, 'diff2.png');
      fs.writeFileSync(diffPath2, comparison2.diffImageBuffer);
      console.log(`差分画像保存: ${diffPath2}`);
    }
    
    if (comparison2.diffPercentage > 10) {
      console.log('✓ 異なるページで大きな差分を検出 (正常)');
    } else {
      console.log('✗ 異なるページなのに差分が小さい (要確認)');
    }
    console.log('');

    // テスト5: 存在しないURLのチェック
    console.log('【テスト5】存在しないURLのリンク切れチェック');
    const invalidUrl = 'https://this-domain-does-not-exist-12345.com';
    console.log(`URL: ${invalidUrl}`);
    const invalidLinkStatus = await checkLinkStatus(invalidUrl);
    console.log(`結果: ${invalidLinkStatus.ok ? '✗ OK (異常)' : '✓ エラー検出 (正常)'}`);
    if (invalidLinkStatus.error) {
      console.log(`エラー: ${invalidLinkStatus.error}`);
    }
    console.log('');

    console.log('=== テスト完了 ===');
    console.log(`\n出力ディレクトリ: ${testDir}`);
    console.log('生成されたファイル:');
    const files = fs.readdirSync(testDir);
    files.forEach(file => {
      const filePath = path.join(testDir, file);
      const stats = fs.statSync(filePath);
      console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });

  } catch (error: any) {
    console.error('\n✗ テスト中にエラーが発生しました:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
