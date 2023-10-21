import puppeteer from 'puppeteer';
// const fetch = require('node-fetch');
import fetch from 'node-fetch';

function printSec(description: string, time: string) {
  console.log(`${description}: \x1b[34m${time}s\x1b[0m`);
}

export async function scrap(url: string): Promise<any> {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--lang=ko-KR'] });
  // --no-sandbox 를 추가해야 docker에서 동작한다
  // root 사용자로 실행되는 docker 컨테이너이기 때문에 문제가 발생함 <- 보안 문제가 발생할 수는 있음
  // 신뢰할 수 있는 사이트만 접근해야함
  const page = await browser.newPage();

  const startGotoTime = new Date().getTime();
  // 인스타그램의 게시물 URL
  await page.goto(url, { waitUntil: 'networkidle0' });
  const endGotoTime = new Date().getTime();
  printSec('page goto', ((endGotoTime - startGotoTime) / 1000).toFixed(2));

  const startEvaluateTime = new Date().getTime();

  const mainImgsSet = new Set<string>();
  while (true) {
    // "style" 속성이 있는 img 요소의 src 가져오기
    const imgSrcs = await page.$$eval("div[role='button'] img",
      imgs =>
        imgs
          .filter(img => img.hasAttribute('style'))
          .map(img => img.src)
    );
    if (imgSrcs.length === 0) {
      break; // 이미지가 없으면 루프 종료
    }

    imgSrcs.forEach(imgSrc => mainImgsSet.add(imgSrc));

    // 첫 번째 이미지의 src를 사용하여 페이지 컨텍스트에서 더 많은 작업 수행
    const isMultiArticle = await page.$('button[aria-label="Next"]') !== null;

    if (isMultiArticle) {
      await page.click('button[aria-label="Next"]'); // 영어로 접속되어서 "다음"이 아니라 "Next"로 변경
      await page.waitForTimeout(500); // 클릭 후에 페이지가 로드될 시간을 기다립니다. 실제 시간은 조정이 필요할 수 있습니다.
    } else {
      break;
    }
  }

  const endEvaluateTime = new Date().getTime();
  printSec('page evaluate', ((endEvaluateTime - startEvaluateTime) / 1000).toFixed(2));
  await browser.close(); // 브라우저 닫기
  const mainImgSrcs = Array.from(mainImgsSet);

  const imagesBase64 = await Promise.all(
    mainImgSrcs.map(async (imgSrc) => {
      const response = await fetch(imgSrc);
      const buffer = await response.buffer();
      const contentType = response.headers.get('Content-Type');
      return `data:${contentType};base64,` + buffer.toString('base64'); // 이미지를 Base64로 인코딩
    })
  );

  return imagesBase64;
}