import {Options} from "selenium-webdriver/chrome";
import {Builder, By, Capabilities, WebDriver, WebElement} from "selenium-webdriver";
import fs from "fs";
import {CistParser} from "./src/CistParser";


(async () => {
  const opts = new Options();
  opts.addArguments(
    "--headless"
  );
  opts.detachDriver(true);

  const caps = new Capabilities();
  caps.setPageLoadStrategy("eager");

  const driver = await new Builder()
    .withCapabilities(caps)
    .setChromeOptions(opts)
    .usingServer("http://localhost:4444/wd/hub")
    .forBrowser("chrome")
    .build();

  await driver.get("https://cist.nure.ua/");
  await driver.executeScript("doSubmit('T_TIME_TABLE')");

  let chosenGroupID = [];

  const session = (await driver.getCurrentUrl()).match(/[0-9]{16}/g)?.[0];
  const rawData = await driver.findElements(By.css("div#GROUPS_AJAX table.t13FormRegion"));

  let timeTable = [];

  for (let item of rawData) {
    const curCourse = await item.findElement(By.css("thead th.t13RegionTitle")).getText();
    timeTable.push(
      {
        course: curCourse,
        groups: [] as any
      }
    );

    const curGroups = await item.findElements(By.css("tbody td.t13RegionBody a"));
    for (let group of curGroups) {
      const rawGroup: string = await group.getAttribute("onclick");
      const dataGroup: string[] = rawGroup.match(/('[А-Яа-яёЁЇїІіЄєҐґ]+-[0-9]+-[0-9]+',[0-9]+)/gm)![0].split(",");
      timeTable.slice(-1)[0].groups.push(
        {
          id: dataGroup[1],
          name: dataGroup[0].match(/[А-Яа-яёЁЇїІіЄєҐґ]+-[0-9]+-[0-9]+/gm)![0]
        }
      );
    }
  }

  chosenGroupID[0] = timeTable[0].groups[8].id;
  chosenGroupID[1] = timeTable[0].groups[8].name;

  const timeTableUrl = `https://cist.nure.ua/ias/app/tt/f?p=778:201:${session}:::201:P201_FIRST_DATE,P201_LAST_DATE,P201_GROUP,P201_POTOK:${getDates()[0]},${getDates()[1]},${chosenGroupID[0]},0:`;

  const cistParser = new CistParser(driver, timeTableUrl);
  const pairs = await cistParser.parse();
  await cistParser.choseGroup("");
  try {
    fs.writeFileSync(`timeTable-${chosenGroupID[1]}.json5`, JSON.stringify(pairs));
    console.log("SAVED");
  } catch (e) {
    console.log("NO SAVED");
  }

  await driver.close();
})();
