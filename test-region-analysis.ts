/**
 * 領域別差分検出機能のテスト
 * ユーザー提供のURLで、ファーストビューのみの変更を検出できるかテスト
 */

import { captureScreenshot, compareScreenshotsByRegion } from './server/monitoring';
import * as fs from 'fs';
import * as path from 'path';

async function testRegionAnalysis() {
  console.log('=== 領域別差分検出機能のテスト ===\n');

  const testDir = path.join(process.cwd(), 'test-output-region');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const url1 = 'https://qoo10-lp.magitech-tool-lab.com/lp1/';
  const url2 = 'https://qoo10-lp.magitech-tool-lab.com/lp2/';

  try {
    console.log('【テスト】ファーストビューのみ変更されたページの検出\n');
    console.log(`URL1: ${url1}`);
    console.log(`URL2: ${url2}`);
    console.log('(これらはファーストビューのみ異なるページです)\n');

    // スクリーンショット撮影
    console.log('スクリーンショットを撮影中...');
    const screenshot1 = await captureScreenshot(url1);
    const screenshot2 = await captureScreenshot(url2);
    console.log('✓ 撮影完了\n');

    // 保存
    fs.writeFileSync(path.join(testDir, 'lp1.png'), screenshot1);
    fs.writeFileSync(path.join(testDir, 'lp2.png'), screenshot2);

    // 領域別比較
    console.log('領域別差分分析を実行中...');
    const analysis = await compareScreenshotsByRegion(screenshot1, screenshot2);
    console.log('✓ 分析完了\n');

    // 結果表示
    console.log('【分析結果】');
    console.log(`全体の差分率: ${analysis.overall.toFixed(4)}%`);
    console.log(`\n【領域別の差分率】`);
    console.log(`  上部 (ファーストビュー): ${analysis.topThird.toFixed(4)}%`);
    console.log(`  中部:                    ${analysis.middleThird.toFixed(4)}%`);
    console.log(`  下部:                    ${analysis.bottomThird.toFixed(4)}%`);
    console.log(`\n【分析結果】`);
    console.log(`  ${analysis.analysis}`);

    // 差分画像を保存
    if (analysis.diffImageBuffer) {
      const diffPath = path.join(testDir, 'diff-region.png');
      fs.writeFileSync(diffPath, analysis.diffImageBuffer);
      console.log(`\n差分画像を保存: ${diffPath}`);
    }

    // 評価
    console.log('\n【評価】');
    
    if (analysis.analysis.includes('ファーストビュー(上部)のみ変更あり')) {
      console.log('✅ 正しく検出されました！');
      console.log('   → ファーストビュー(上部)のみ変更されていることを検出');
      console.log(`   → 上部: ${analysis.topThird.toFixed(2)}% > 中部: ${analysis.middleThird.toFixed(2)}% > 下部: ${analysis.bottomThird.toFixed(2)}%`);
    } else if (analysis.analysis.includes('ページ全体')) {
      console.log('⚠️  ページ全体が変更されていると判定されました');
    } else if (analysis.analysis.includes('変更なし')) {
      console.log('⚠️  変更が検出されませんでした');
    } else {
      console.log('✅ 部分的な変更を検出');
      console.log(`   → ${analysis.analysis}`);
    }

    console.log('\n【詳細】');
    console.log(`出力ディレクトリ: ${testDir}`);
    const files = fs.readdirSync(testDir);
    console.log('生成されたファイル:');
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

testRegionAnalysis();
