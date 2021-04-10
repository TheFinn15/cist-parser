import {Options} from "selenium-webdriver/chrome";
import {Builder, Capabilities} from "selenium-webdriver";
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

  const cistParser = new CistParser(driver);

  await cistParser.choseFaculty("ІРТЗІ");
  await cistParser.parseGroups();
  await cistParser.choseGroup("ЕСТМ-19-1");

  await driver.close();
})();
