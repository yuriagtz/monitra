/**
 * ユーザー提供URLでのスクリーンショット比較テスト
 */

import { captureScreenshot, compareScreenshots, checkLinkStatus } from './server/monitoring';
import * as fs from 'fs';
import * as path from 'path';

async function runUserUrlTests() {
  console.log('=== ユーザー提供URLでのテスト開始 ===\n');

  const testDir = path.join(process.cwd(), 'test-output-user');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const url1 = 'https://qoo10-lp.magitech-tool-lab.com/lp1/';
  const url2 = 'https://qoo10-lp.magitech-tool-lab.com/lp2/';

  try {
    // テスト1: URL1のリンク切れチェック
    console.log('【テスト1】URL1のリンク切れチェック');
    console.log(`URL: ${url1}`);
    const linkStatus1 = await checkLinkStatus(url1);
    console.log(`結果: ${linkStatus1.ok ? '✓ OK' : '✗ エラー'}`);
    if (linkStatus1.status) {
      console.log(`HTTPステータス: ${linkStatus1.status}`);
    }
    if (linkStatus1.error) {
      console.log(`エラー: ${linkStatus1.error}`);
    }
    console.log('');

    // テスト2: URL2のリンク切れチェック
    console.log('【テスト2】URL2のリンク切れチェック');
    console.log(`URL: ${url2}`);
    const linkStatus2 = await checkLinkStatus(url2);
    console.log(`結果: ${linkStatus2.ok ? '✓ OK' : '✗ エラー'}`);
    if (linkStatus2.status) {
      console.log(`HTTPステータス: ${linkStatus2.status}`);
    }
    if (linkStatus2.error) {
      console.log(`エラー: ${linkStatus2.error}`);
    }
    console.log('');

    // テスト3: URL1のスクリーンショット撮影
    console.log('【テスト3】URL1のスクリーンショット撮影');
    console.log(`URL: ${url1}`);
    const screenshot1 = await captureScreenshot(url1);
    const screenshot1Path = path.join(testDir, 'lp1.png');
    fs.writeFileSync(screenshot1Path, screenshot1);
    console.log(`✓ スクリーンショット保存: ${screenshot1Path}`);
    console.log(`サイズ: ${(screenshot1.length / 1024).toFixed(2)} KB`);
    console.log('');

    // テスト4: URL2のスクリーンショット撮影
    console.log('【テスト4】URL2のスクリーンショット撮影');
    console.log(`URL: ${url2}`);
    const screenshot2 = await captureScreenshot(url2);
    const screenshot2Path = path.join(testDir, 'lp2.png');
    fs.writeFileSync(screenshot2Path, screenshot2);
    console.log(`✓ スクリーンショット保存: ${screenshot2Path}`);
    console.log(`サイズ: ${(screenshot2.length / 1024).toFixed(2)} KB`);
    console.log('');

    // テスト5: URL1とURL2の比較
    console.log('【テスト5】URL1とURL2の比較');
    const comparison = await compareScreenshots(screenshot1, screenshot2);
    console.log(`差分率: ${comparison.diffPercentage.toFixed(4)}%`);
    
    if (comparison.diffImageBuffer) {
      const diffPath = path.join(testDir, 'diff-lp1-vs-lp2.png');
      fs.writeFileSync(diffPath, comparison.diffImageBuffer);
      console.log(`差分画像保存: ${diffPath}`);
    }
    
    if (comparison.diffPercentage > 1) {
      console.log('✓ 差分を検出 (1%以上の変更あり)');
    } else if (comparison.diffPercentage > 0) {
      console.log('⚠️ わずかな差分を検出 (1%未満)');
    } else {
      console.log('✓ 差分なし (完全一致)');
    }
    console.log('');

    // テスト6: URL1を再撮影して比較(安定性チェック)
    console.log('【テスト6】URL1を再撮影して比較(安定性チェック)');
    console.log(`URL: ${url1}`);
    const screenshot1Again = await captureScreenshot(url1);
    const screenshot1AgainPath = path.join(testDir, 'lp1-again.png');
    fs.writeFileSync(screenshot1AgainPath, screenshot1Again);
    console.log(`✓ スクリーンショット保存: ${screenshot1AgainPath}`);
    
    const comparisonSame = await compareScreenshots(screenshot1, screenshot1Again);
    console.log(`差分率: ${comparisonSame.diffPercentage.toFixed(4)}%`);
    
    if (comparisonSame.diffImageBuffer) {
      const diffPathSame = path.join(testDir, 'diff-lp1-vs-lp1.png');
      fs.writeFileSync(diffPathSame, comparisonSame.diffImageBuffer);
      console.log(`差分画像保存: ${diffPathSame}`);
    }
    
    if (comparisonSame.diffPercentage < 1) {
      console.log('✓ 同じページの差分が1%未満 (安定している)');
    } else {
      console.log('⚠️ 同じページなのに差分が大きい (動的コンテンツの可能性)');
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

    console.log('\n【まとめ】');
    console.log(`URL1とURL2の差分率: ${comparison.diffPercentage.toFixed(4)}%`);
    console.log(`URL1の再撮影での差分率: ${comparisonSame.diffPercentage.toFixed(4)}%`);
    
    if (comparison.diffPercentage > 1 && comparisonSame.diffPercentage < 1) {
      console.log('\n✓ 監視システムは正常に動作しています');
      console.log('  - 異なるページは確実に検出');
      console.log('  - 同じページは安定して一致');
    }

  } catch (error: any) {
    console.error('\n✗ テスト中にエラーが発生しました:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runUserUrlTests();
